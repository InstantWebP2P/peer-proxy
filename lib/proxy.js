// Copyright (c) 2013 Tom Zhou<iwebpp@gmail.com>

var WEBPP = require('iwebpp.io'),
    SEP = WEBPP.SEP,
    vURL = WEBPP.vURL,
    httppProxy = require('httpp-proxy'),
    URL = require('url'),
    zlib = require('zlib'),
    Buffer = require('buffer').Buffer,
    Iconv = require('iconv-lite'),
    Jschardet = require('jschardet'),
    Connect = require('connect'),
    trumpet = require('trumpet'),
    NET = require('net'),
    UDT = require('udt');

// authentication module
var httpauth = require('http-auth');

// security hash
// sipkey can be any user defined 4 integers
var siphash = require('siphash'),
    sipkey = [0x66662222, 0x86868686, 0x66665555, 0x33339999]; // magic key

// Debug level
// 1: display error, proxy entry
// 2: display req/res headers/statusCode
var Debug = 0;

// Proxy class
// a proxy will contain one iwebpp.io name-client
// -        websites: array of web site/service URL, like ['http://sohu.com', 'https://google.com'] 
// -              fn: callback to pass proxy informations
// -         options: user custom parameters, like {secmode: ..., usrkey: ..., mode: ..., domain: ..., endpoints: ..., turn: ...}
// - options.secmode: ssl, enable ssl/https; acl, enable ssl/https,host-based ACL
// - options.sslmode: srv, only verify server side cert; both, verify both server and client side cert
///
// -   options.level: srv, only proxy url/link on server side; both, proxy url/link on both server and web site
// -    options.auth: http basic-auth as username:password
var Proxy = module.exports = function(websites, fn, options){ 
    var self = this;
       
    if (!(this instanceof Proxy)) return new Proxy(websites, fn, options);
    
    if (!Array.isArray(websites)) websites = [websites];
        
    // check proxy level
    options = options || {};
    options.level = options.level || 'srv';
    
    // check basic auth
    var basicauth = false;
    if (options && options.auth) {
    	var astr = options.auth.split(':');
    	basicauth = {username: astr && astr[0], password: astr && astr[1]};
    }

    // check upload 
    var fileupload = false;
    
    // 0.
    // proxy cache and URLs
    self.proxyCache = {}; // http proxy for website
    self.proxyURL   = {}; // vURL for website
    self.proxyChd   = {}; // child link in websites
    self.proxyPrn   = {}; // parent link for websites
    
    // 1.
    // create name client
    var nmcln = self.nmcln = new WEBPP({
        usrinfo: {
            domain: (options && options.domain) || '51dese.com',
            usrkey: (options && options.usrkey) || ('peerproxy@'+Date.now())
        },
        
        srvinfo: {
            timeout: 20,
            endpoints: (options && options.endpoints) || [
                {ip: '51dese.com', port: 51686},
                {ip: '51dese.com', port: 51868}
            ],
            turn: (options && options.turn) || [
                {ip: '51dese.com', agent: 51866, proxy: 51688}
            ]
        },
        
        // vURL mode: vhost-based
        vmode: vURL.URL_MODE_HOST, 
        
        // secure mode
        secmode: (options && options.secmode === 'ssl') ? SEP.SEP_SEC_SSL : 
                                                          SEP.SEP_SEC_SSL_ACL_HOST,
        		
        // ssl mode
        sslmode: (options && options.sslmode === 'srv') ? SEP.SEP_SSL_AUTH_SRV_ONLY :
                                                          SEP.SEP_SSL_AUTH_SRV_CLNT		
    });
	
	// 1.1
	// check ready
	nmcln.once('ready', function(){
	    if (Debug) console.log('name-client ready on vURL:'+nmcln.vurl);
	    
	    // 2.
	    // setup proxy App
	    // notes: main URL entry without parent URL
	    for (var idx = 0; idx < websites.length; idx ++) 
	        self.addURL(websites[idx], {level: options.level}); 
	    
	    // 3.
	    // http proxy
	    
	    // website vhost regex as p(16hex)p-
	    var vhostregex = /p([0-9]|[a-f]){16}p-/gi;
	    var vpathregex = /-p([0-9]|[a-f]){16}p/gi;
	    
	    var proxyHttp = function(req, res, next){
	        var vstrs, vurle;
	        
	        // 3.1
	        // check vURL
	        if ((self.nmcln.vmode === vURL.URL_MODE_HOST) &&
	            (vstrs = req.headers.host.match(vhostregex))) {
	            vurle = vstrs[0];
	        } else if ((self.nmcln.vmode === vURL.URL_MODE_PATH) &&
	                   (vstrs = req.url.match(vpathregex))) {
	            vurle = vstrs[0];
	        } else {
	            // invalid vURL, nothing to do
                if (Debug) console.error('http invalid vURL:'+JSON.stringify(req.headers));
                next();
                return;
	        }
	        
	        // 3.2
	        // !!! rewrite req.url to remove vToken parts
	        // TBD ... vToken check
	        ///req.url = req.url.replace(vURL.regex_vtoken, '');
	        if (vURL.regex_vtoken.test(req.url)) {
		        res.writeHead(301, {'location': req.url.replace(vURL.regex_vtoken, '')});
		        res.end();
		        return;
		    }
            
            // 3.3
            // proxy target
            if (self.proxyCache[vurle]) {
                self.proxyCache[vurle].proxyRequest(req, res);
            } else {
                // unknown vURL
                res.writeHead(400);
                res.end('unknown vURL');
                if (Debug) console.error('unknown vURL:'+JSON.stringify(req.headers));
                    return;
            }
	    };
	    
	    // 4.
	    // create http proxy App
	    var appHttp = Connect();
	    
	    // 4.1
	    // add third-party connect middle-ware
	    
	    // 4.1.1
	    // add http basic-auth module
	    if (basicauth) {
	    	var basic = httpauth.basic({
	    		realm: "51dese.com"
	    	}, function (username, password, callback) {
	    		callback(username === basicauth.username && 
	    				 password === basicauth.password);
	    	});

	    	appHttp.use(httpauth.connect(basic));
	    }
	    
	    // 4.1.2
	    // compress
	    // TBD...
	    ///appHttp.use(Connect.compress());
	    
	    // 4.1.3
	    // cache
	    ///appHttp.use(Connect.staticCache({maxLength: 512*1024, maxObjects: 64}));
	    
	    // ... 
	    
	    // 4.1.6
	    // query string parser
	    appHttp.use(Connect.query());
	    
	    // 4.2
	    // portal page -> //////////////////////////////////////////////////////////
	    
	    // 4.2.1
	    // static file service
	    appHttp.use('/vstatic', Connect.static(__dirname + '/public'));
	    
	    // 4.2.2
	    // admin service, checking admin node like 1XX,2XX,3XX,etc
	    // notes: to enable admin mode append /vadmin[/:mode] in req.url
	    
        // 4.2.2.1
        // - 1XX: retrieve all proxed website list
        appHttp.use('/vadmin/1', function(req, res, next){
            var htmlstr = '';
            
            htmlstr += '<ol>';
            for (var site in self.proxyURL) {
                if (Debug) console.log('plink of '+site+': '+self.proxyPrn[site]);
                ///if (self.proxyPrn[site]) continue;
                
                htmlstr += '<li>'+
                           '<a href='+
                           '"'+self.proxyURL[site]+'">'+
                           '>> '+site+
                           '</a>'+
                           '</li>';
            }
            htmlstr += '</ol>';
            
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(htmlstr);
        });
	    
	    // 4.2.2.2
	    // - 2XX: add single website to proxy by querystring, then return html
	    // like /vadmin/2/?url=xxx&purl=xxx 
	    appHttp.use('/vadmin/2', function(req, res, next){	        
            if (Debug) console.log('req.query:'+JSON.stringify(req.query));
            
            if (req.query && req.query.url){
                var vurl = self.addURL(req.query.url, {purl: req.query.purl, level: options.level});
                if (vurl) {
                    res.writeHead(301, {'location': vurl});
		            res.end();
                } else {
                    next('invalid param');
                }
            } else {
                next('invalid param');
            }
        });
        
 	    // 4.2.2.3
	    // - 3XX: add batch of website to proxy by querystring, then return json
	    // like /vadmin/3/?url=xxx,yyy,zzz&purl=xxx 
	    appHttp.use('/vadmin/3', function(req, res, next){	        
            if (Debug) console.log('req.query:'+JSON.stringify(req.query));
            
            if (req.query && req.query.url){
                var urls = req.query.url.split(',');
                var vobj = {};
            
                for (var idx in urls) {
                    var vurl = self.addURL(urls[idx], {purl: req.query.purl, level: options.level});
                    if (vurl) {
                        vobj[urls[idx]] = vurl;
                    }
                }
                            
	            res.writeHead(200, {'Content-Type': 'application/json'});
	            res.end(JSON.stringify(vobj));
            } else {
                next('invalid param');
            }
        });
                       
	    // <- portal page //////////////////////////////////////////////////////////////
	    	 
	    // 4.3
	    // add http proxy in App
	    appHttp.use(proxyHttp);
	    
	    // 5.
	    // websocket proxy
	    var appWs = function(req, socket, head){
	        var vstrs, vurle;
	        
	        // 5.1
	        // check vURL
	        if ((self.nmcln.vmode === vURL.URL_MODE_HOST) &&
	            (vstrs = req.headers.host.match(vhostregex))) {
	            vurle = vstrs[0];
	        } else if ((self.nmcln.vmode === vURL.URL_MODE_PATH) &&
	                   (vstrs = req.url.match(vpathregex))) {
	            vurle = vstrs[0];
	        } else {
	        	// invalid vURL, nothing to do
                // MUST not close socket, which will break other upgrade listener
                if (Debug) console.error('ws invalid URL:'+JSON.stringify(req.headers));
                return;
	        }
	        
	        // 5.2
	        // !!! rewrite req.url to remove vToken parts
	        // TBD ... vToken check
	        req.url = req.url.replace(vURL.regex_vtoken, '');     
	        	        	        
	        // 5.3
            // proxy target
            if (self.proxyCache[vurle]) {
                self.proxyCache[vurle].proxyWebSocketRequest(req, socket, head);
            } else {
                // unknown vURL
                socket.end('unknown vURL');
                if (Debug) console.error('unknown vURL:'+JSON.stringify(req.headers));
                return;
            }
	    };
	    
	    // 6.
	    // https tunnel proxy 
	    // notes: the idea is see https request/websocket proxy as reverse proxy to destination http/https website,
        // so, create connection to peer-proxy httpps server self.
	    var appTunnel = function(req, socket, head){
            var roptions = {
			        port: nmcln.port,
			        host: nmcln.ipaddr,
                localAddress: {
                    addr: nmcln.ipaddr
                }
	        };
		        
            if (Debug) console.log('http tunnel proxy, connect to self %s:%d', nmcln.ipaddr, nmcln.port);
            
            var srvSocket = UDT.connect(roptions, function() {
                if (Debug) console.log('http tunnel proxy, got connected!');   
                
                ///srvSocket.write(head);
			    socket.pipe(srvSocket);
			     
			    socket.write('HTTP/1.1 200 Connection Established\r\n' +
			                 'Proxy-agent: Node-Proxy\r\n' +
			                 '\r\n');					    
			    srvSocket.pipe(socket);
            });
            
		    srvSocket.on('error', function(e) {
		        console.log("http tunnel proxy, socket error: " + e);
		        socket.end();
		    });
	    };
	    
	    // 7.
	    // hook App on name-client
	    nmcln.bsrv.srv.on('request', appHttp);	
	    nmcln.bsrv.srv.on('upgrade', appWs);
	    nmcln.bsrv.srv.on('connect', appTunnel);
	    
	    // 8.
	    // pass proxy URLs back
	    fn(null, self.proxyURL);
	    
    	// 9.
        // report peer-service
        // like {vurl:x,cate:x,name:x,desc:x,tags:x,acls:x,accounting:x,meta:x}
        for (var origin in self.proxyURL) {
	        nmcln.reportService({
	            vurl: self.proxyURL[origin],
	            cate: 'peer-proxy',
	            name: origin,
	            meta: {origin: origin}
	        });
        }
        
        // 9.1
        // update peer-service: connetion loss, etc
        // TBD...
	});
	
	// 1.2
	// check error
	nmcln.on('error', function(err){
	    console.log('name-client create failed:'+JSON.stringify(err));
	    fn(err);
	});
};

// instance methods

// add URL proxy entry
// options: {purl: ...}
// -    purl: parent or root URL
Proxy.prototype.addURL = function(oriUrl, options){
    var sUrl  = oriUrl.match(/^(http:\/\/)|^(https:\/\/)/gi)? oriUrl : 'http://'+oriUrl;
    
    var self  = this;
    var urls  = URL.parse(sUrl, true, true);
    var host  = urls.hostname;
    var proto = urls.protocol || 'http:';
    var port  = urls.port || ((proto === 'wss:' || proto === 'https:')? 443 : 80);
    var path  = urls.path;
    
    var urle  = proto+'//'+urls.host; // proto+host striped path part of URL
    
    
    // check urls
    if (!host) {
        console.log('invalid URL to proxy: '+oriUrl);
        return null;
    }
    
    // check options
    var purl  = (options && options.purl) || '';
    
    // check proxy level
    var level = (options && options.level) || 'srv';
    
    // vURL string format, like pxxxp. in vhost mode or /pxxxp in vpath mode
    var vstrs = self.nmcln.vurl.split('//');
    var wstrs = siphash.hash_hex(sipkey, urle);
    var vurle = (self.nmcln.vmode === vURL.URL_MODE_HOST) ? 'p'+wstrs+'p-' : '-p'+wstrs+'p';

    ///console.log('add proxy url:'+oriUrl);
    
    // 1.
    // create proxy to target
    if (!self.proxyCache[vurle]) {
	    self.proxyCache[vurle] = new httppProxy.HttpProxy({
	        changeOrigin: true,
	        enable: {xforward: false},
	        
	        httpp: true,
	        https: self.nmcln.secmode,
	        
	        /*forward: {
	           httpp: false, 
	            
	             host: host,
	             port: port,
	            https: (proto === 'wss:' || proto === 'https:')
	        },*/
	        
	        target: {
	            httpp: false, 
	            
	             host: host,
	             port: port,
	            https: (proto === 'wss:' || proto === 'https:')
	        }
	    });   
	    
	    // hook urle,vurle,purl in httpProxy instance
	    self.proxyCache[vurle].urle  = urle;
	    self.proxyCache[vurle].vurle = vurle;
	    
	    // 1.1
	    // Handle request error
	    self.proxyCache[vurle].on('proxyError', function(err, req, res){
	        if (Debug) console.error(err+',proxy to '+urle);
	        
	        // 1.1.1
	        // send error back
	        try {
	            res.writeHead(500, {'Content-Type': 'text/plain'});
			    if (req.method !== 'HEAD') {
		            if (process.env.NODE_ENV === 'production') {
		                res.write('Internal Server Error');
		            } else {
		                res.write('An error has occurred: ' + JSON.stringify(err));
		            }
		        }
	            res.end();
	        } catch (ex) {
	            console.error("res.end error: %s", ex.message) ;
	        }
	        
	        // 1.1.2
	        // clear vURL entry
	        // notes: still keep it to avoid attack
	        ///self.delURL(urle);
	    });
	    
	    // 1.2
	    // Handle upgrade error
	    self.proxyCache[vurle].on('webSocketProxyError', function(err, req, socket, head){
	        if (Debug) console.error(err+',proxy to '+urle);
	        
	        // send error back
	        try {
	            if (process.env.NODE_ENV === 'production') {
	                socket.write('Internal Server Error');
	            } else {
	                socket.write('An error has occurred: ' + JSON.stringify(err));
	            }
	            socket.end();
	        } catch (ex) {
	            console.error("socket.end error: %s", ex.message) ;
	        }
	        
	        // clear vURL entry
	        // notes: still keep it to avoid attack
            ///self.delURL(urle);
        });
	    
	    // 2.
	    // Handle custom rewrite logics on response
	    self.proxyCache[vurle].on('proxyResponse', function(req, res, response){
	        var prxself = this;
	        if (Debug) console.log('\n\n\nProxy response,'+'req.url:'+req.url+',req.headers:'+JSON.stringify(req.headers)+
	                               '\n\n,response.statusCode:'+response.statusCode+',response.headers:'+JSON.stringify(response.headers));
	        
	        // 3.
	        // rewrite href from text/html,text/xml
	        
	        // 2xx success
	        if ((response.statusCode >= 200 && response.statusCode < 300) && 
	            ('content-type' in response.headers) && 
	            (response.headers['content-type'].match('text/html') ||
	             response.headers['content-type'].match('text/xml'))) {
	            if (Debug) console.log('Proxy 200 response,'+'response.headers:'+JSON.stringify(response.headers));
	            
	            // 3.0
	            // rewrite Content-Location in response
	            if (response.headers['content-location']) {           
                    response.headers['content-location'] = response.headers['content-location'].replace(vURL.regex_url, function(href){
                        var hrefvurl = self.addURL(href);
                        if (Debug) console.log('res.location of text/html:'+href+' -> '+hrefvurl);
                        
                        return hrefvurl;
                    });
	            }
	            	               
	            // 3.1
	            // intercept res.writeHead, res.write and res.end 
	            // notes:
	            // - unzip and zip again
	            // - ...
	            var reshed = {};
	            var resbuf = [];
	            var ressiz = 0;
	            var resstr = '';
	            var _res_write = res.write, _res_end = res.end, _res_writeHead = res.writeHead;
	            var _decomp, _encomp, _codec;
	            
	            // 3.1.1
	            // overwrite res.writeHead by cache statusCode
                res.writeHead = function(statusCode, reasonPhrase, headers) {
                    reshed.statusCode = statusCode;
                    reshed.headers = {};
                    
                    if (typeof reasonPhrase === 'object') {
                        reshed.headers = reasonPhrase;
                    } else if (typeof headers === 'object') {
                        reshed.headers = headers;
                    }
                    
                    Object.keys(reshed.headers).forEach(function (key) {
				        res.setHeader(key, reshed.headers[key]);
				    });
                };
	            
	            // 3.2
	            // handle compressed text
	            if (('content-encoding' in response.headers) &&
	                (response.headers['content-encoding'].match('gzip') ||
	                 response.headers['content-encoding'].match('deflate'))) {
	                if (Debug) console.log('Proxy ziped response,'+'response.headers:'+JSON.stringify(response.headers));
	                 
	                if (response.headers['content-encoding'].match('gzip')) {
	                    _codec  = 'gzip';
	                    _decomp = zlib.createGunzip();
	                    _encomp = zlib.createGzip();
	                } else {
	                    _codec  = 'deflate';
	                    _decomp = zlib.createInflate();
	                    _encomp = zlib.createDeflate();
	                }
	               	                
	                if (Debug) console.log('\n\ngzip');
	                
                    // 3.2.1
                    // override res.write and res.end
                	res.write = function(trunk){
	                    return _decomp.write(trunk);
	                };
	                res.end = function(trunk){
	                    _decomp.end(trunk);
	                };
	                
                    // 3.3
                    // in case handle Node.js-not-supported charset
                    // - detect charset
	                // - decode content by charset 
	                // - rewrite resstr
	                // - send rewrote resstr by charset
	                // - force response on utf-8 charset
	                // TBD...
	                	                	                    
	                _decomp.on('data', function(text) {
                        if (text) {
		                    resbuf.push(text);
		                    ressiz += text.length;
		                }
                    });
                    _decomp.on('end', function() {		
                    	// 3.3.1
		                // concat big buffer
		                var bigbuf = Buffer.concat(resbuf, ressiz);
		                
		                // 3.3.2
		                // detect charset
		                var chardet = Jschardet.detect(bigbuf);
		                var charset = chardet.encoding;
		                
		                if (Debug) console.log('charset:'+JSON.stringify(chardet));
		                		                
		                // 3.3.3
		                // decode content by charset
		                resstr = Iconv.decode(bigbuf, charset);
		                                
                        if (Debug > 1) console.log('text response:'+resstr);
                        
                        // 3.3.4
                        // rewrite text content            
                        ///console.log('before rewrite:'+JSON.stringify(resstr.match(vURL.regex_url)));
                        
                        // 3.3.4.1
                        // rewrite href host part with trumpet
                        // TBD...
                        /*
                        var tr = trumpet();

						tr.select('a', function(node) {
						    node.html(function (html) {
						        console.log(node.name + ': ' + html);
						    });
						});
						tr.end(resstr);
						*/
						
                        // 3.3.4.1
                        // rewrite href host part in head and body of text/html
                        resstr = resstr.replace(/(<head(\s|\S)*\/head>)|(<body(\s|\S)*\/body>)/gi, function(hb){   
                            if (Debug) console.log('head-body:'+hb);    
                            
                            // href rewrite                                            
	                        hb = hb.replace(vURL.regex_url, function(href){
	                            // add proxy for child href 
                                var hrefvurl = self.addURL(
                                    href,
                                    {purl: (req.connection.encrypted ? 'https://' : 'http://')+req.headers.host+req.url});
                                if (Debug) console.log('zipped text/html:'+href+' -> '+hrefvurl);
                                
                                return hrefvurl;
	                        });
	                        
                            // in case full proxy mode, embedded peer-proxy.js and jquery.js in head
	                        if ((level === 'both') && (/<head(\s|\S)*\/head>/gi).test(hb)) {
	                            if (!hb.match(/(jquery\.js)|(jquery\.min\.js)/gi)) {
			                        hb = hb.replace(/<\/head>/gi, function(html){
			                            var text = '<script type="text/javascript" src="/vstatic/jquery-2.0.3.min.js"></script>';
			                            return text + html;
			                        });
		                        }
			                    
			                    if (!hb.match(/(peer-proxy\.js)|(peer-proxy\.min\.js)/gi)) {
			                        hb = hb.replace(/<\/head>/gi, function(html){
			                            var text = '<script type="text/javascript" src="/vstatic/peer-proxy.js"></script>';
			                            return text + html;
			                        });
		                        }
	                        }
	                        
	                        return hb;   
                        });
                        
		                // 3.3.4.1.1
		                // rewrite href host part in other case
                        if (!resstr.match(/(<head(\s|\S)*\/head>)|(<body(\s|\S)*\/body>)/gi)) {   
                            if (Debug) console.log('other-body:'+resstr+',\nreq.url:'+req.url);    
                                                                        
	                        resstr = resstr.replace(vURL.regex_url, function(href){
	                            // add proxy for child href 
                                var hrefvurl = self.addURL(
                                    href,
                                    {purl: (req.connection.encrypted ? 'https://' : 'http://')+req.headers.host+req.url});
                                if (Debug) console.log('zipped text/html:'+href+' -> '+hrefvurl);
                                
                                return hrefvurl;
	                        });
	                    }                        
                        
                        // 3.3.4.2
                        // rewrite href path part in case vpath-based vURL mode
                        if (self.nmcln.vmode === vURL.URL_MODE_PATH) {
                            // rewrite href path part in head and body of text/html
                            resstr = resstr.replace(/(<head(\s|\S)*\/head>)|(<body(\s|\S)*\/body>)/gi, function(hb){
                                if (Debug) console.log('head-body:'+hb);
                                
		                        hb = hb.replace(vURL.regex_url, function(href){
		                            if (Debug) console.log('href:'+href);
		                            
		                            // skip on host-based rewrite
		                            if (href.match(vURL.regex_url)) {
		                                return href;
		                            } else {
			                            var vurlstrs = self.nmcln.vurl.split('/');
			                            var vurlpath = '/';
			                            
			                            for (var idx = 3; idx < vurlstrs.length; idx ++) {
			                                vurlpath += vurlstrs[idx];
			                                if (idx < (vurlstrs.length - 1)) vurlpath += '/';
			                            }
			                            vurlpath += prxself.vurle;
			                            
			                             // req.url string
			                            var requrls = URL.parse(req.url, true, true);
			                            
			                            // like href="ruyier/"
			                            var hrefstrs = href.split('"');
			                            var hrefpath = hrefstrs[1];
			                            
			                            // append vPath
			                            return (hrefstrs[0]+'"'+
			                                    ((hrefpath[0] === '/') ? vurlpath : (vurlpath + requrls.path + '/'))+
			                                    hrefstrs[1]+ '"');
		                            }
		                        });
		                        
		                        // in case full proxy mode, embedded peer-proxy.js and jquery.js in head
		                        if ((level === 'both') && (/<head(\s|\S)*\/head>/gi).test(hb)) {
		                        	if (!hb.match(/(jquery\.js)|(jquery\.min\.js)/gi)) {
				                        hb = hb.replace(/<\/head>/gi, function(html){
				                            var text = '<script type="text/javascript" src="/vstatic/jquery-2.0.3.min.js"></script>';
				                            return text + html;
				                        });
			                        }
				                    
				                    if (!hb.match(/(peer-proxy\.js)|(peer-proxy\.min\.js)/gi)) {
				                        hb = hb.replace(/<\/head>/gi, function(html){
				                            var text = '<script type="text/javascript" src="/vstatic/peer-proxy.js"></script>';
				                            return text + html;
				                        });
			                        }
		                        }
	                        		                        
		                        return hb;
		                    });
		                    
		                    // 3.3.4.2.1
		                    // rewrite href host part in other case
	                        // TBD ...
                        }
                        
                        ///console.log('after rewrite:'+JSON.stringify(resstr.match(vURL.regex_url)));
		                if (Debug > 1) console.log('overwrote text response:'+resstr);
                        
                        // 3.3.5
                        // compress overwrote text and send out
                        if (_codec === 'gzip') {
                            var encbuf = Iconv.encode(resstr, charset);
                            
                            // rewrite content-length
                            res.setHeader('content-length', encbuf.length);
                            res.writeHead = _res_writeHead;
                            res.writeHead(reshed.statusCode || 200);
                            
                            zlib.gzip(encbuf, function(err, buffer) {
                                if (err) {
                                    console.log(err+',deflate failed');
                                    res.emit('error', err+',gzip failed');
                                } else {
									res.write = _res_write;
									res.end = _res_end;
									
									res.end(buffer);
                                }
                            });
                        } else {
                            var encbuf = Iconv.encode(resstr, charset);
                            
                            // rewrite content-length
                            res.setHeader('content-length', encbuf.length);
                            res.writeHead = _res_writeHead;
                            res.writeHead(reshed.statusCode || 200);
                            
                            zlib.deflate(encbuf, function(err, buffer) {
                                if (!err) {
                                    console.log(err+',deflate failed');
                                    res.emit('error', err+',deflate failed');
                                } else {
									res.write = _res_write;
									res.end = _res_end;
									
									res.end(buffer);
                                }
                            });                        
                        }
                    });
                    
                    // 3.4
                    // decompress data 
                    _decomp.on('drain', function(){
                        res.emit('drain');
                    });
	            } else {
	                if (Debug) console.log('\n\nnotzip');
	                
	                // 3.5
	                // in case handle Node.js-not-supported charset
                    // - detect charset
	                // - decode content by charset 
	                // - rewrite resstr
	                // - send rewrote by charset
	                // - force response on utf-8 charset
	                // TBD...
	                	                
	                // 3.5.1
                    // override res.write and res.end
		            res.write = function(text){
		                if (text) {
		                    resbuf.push(text);
		                    ressiz += text.length;
		                }
		                return true;
		            };
		            res.end = function(text){
		                if (text) {
		                    resbuf.push(text);
		                    ressiz += text.length;
		                }
		                
		                // 3.5.2
		                // concat big buffer
		                var bigbuf = Buffer.concat(resbuf, ressiz);
		                
		                // 3.5.3
		                // detect charset
		                var chardet = Jschardet.detect(bigbuf);
		                var charset = chardet.encoding;
		                
		                if (Debug) console.log('charset:'+JSON.stringify(chardet));
		                		                
		                // 3.5.4
		                // decode content by charset
		                resstr = Iconv.decode(bigbuf, charset);
		                
		                if (Debug > 1) console.log('text response:'+resstr);
		                
                        // 3.5.5
                        // rewrite text content
                        ///console.log('before rewrite:'+JSON.stringify(resstr.match(vURL.regex_url)));
                        
                        // 3.5.5.1
                        // rewrite href host part with trumpet 
                        // TBD...
                        /*
                        var tr = trumpet();

						tr.select('a', function(node) {
						    node.html(function (html) {
						        console.log(node.name + ': ' + html);
						    });
						});
						tr.end(resstr);
						*/
						
                        // 3.5.5.1
                        // rewrite href host part in head and body of text/html
                        resstr = resstr.replace(/(<head(\s|\S)*\/head>)|(<body(\s|\S)*\/body>)/gi, function(hb){   
                            if (Debug) console.log('head-body:'+hb);    
                                                                        
	                        hb = hb.replace(vURL.regex_url, function(href){
	                            // add proxy for child href 
                                var hrefvurl = self.addURL(
                                    href,
                                    {purl: (req.connection.encrypted ? 'https://' : 'http://')+req.headers.host+req.url});
                                if (Debug) console.log('zipped text/html:'+href+' -> '+hrefvurl);
                                
                                return hrefvurl;
	                        });
	                        
	                        // in case full proxy mode, embedded peer-proxy.js and jquery.js in head
	                        if ((level === 'both') && (/<head(\s|\S)*\/head>/gi).test(hb)) {
	                        	if (!hb.match(/(jquery\.js)|(jquery\.min\.js)/gi)) {
	                        		hb = hb.replace(/<\/head>/gi, function(html){
			                            var text = '<script type="text/javascript" src="/vstatic/jquery-2.0.3.min.js"></script>';
			                            return text + html;
			                        });
		                        }
			                    
			                    if (!hb.match(/(peer-proxy\.js)|(peer-proxy\.min\.js)/gi)) {
			                        hb = hb.replace(/<\/head>/gi, function(html){
			                            var text = '<script type="text/javascript" src="/vstatic/peer-proxy.js"></script>';
			                            return text + html;
			                        });
		                        }
	                        }
	                        	                        
	                        return hb;   
                        });
                        
                        // 3.5.5.1.1
		                // rewrite href host part in other case
                        if (!resstr.match(/(<head(\s|\S)*\/head>)|(<body(\s|\S)*\/body>)/gi)) {   
                            if (Debug) console.log('other-body:'+resstr+',\nreq.url:'+req.url);  
                                                                        
	                        resstr = resstr.replace(vURL.regex_url, function(href){
	                            // add proxy for child href 
                                var hrefvurl = self.addURL(
                                    href,
                                    {purl: (req.connection.encrypted ? 'https://' : 'http://')+req.headers.host+req.url});
                                if (Debug) console.log('zipped text/html:'+href+' -> '+hrefvurl);
                                
                                return hrefvurl;
	                        });
	                    }
                        
                        // 3.5.5.2
                        // rewrite href path part in case vpath-based vURL mode
                        if (self.nmcln.vmode === vURL.URL_MODE_PATH) {
                            // rewrite href path part in head and body of text/html
                            resstr = resstr.replace(/(<head(\s|\S)*\/head>)|(<body(\s|\S)*\/body>)/gi, function(hb){
                                if (Debug) console.log('head-body:'+hb);
                                
		                        hb = hb.replace(vURL.regex_url, function(href){
		                            if (Debug) console.log('href:'+href);
		                            
		                            // skip on host-based rewrite
		                            if (href.match(vURL.regex_url)) {
		                                return href;
		                            } else {
			                            var vurlstrs = self.nmcln.vurl.split('/');
			                            var vurlpath = '/';
			                            
			                            for (var idx = 3; idx < vurlstrs.length; idx ++) {
			                                vurlpath += vurlstrs[idx];
			                                if (idx < (vurlstrs.length - 1)) vurlpath += '/';
			                            }
			                            vurlpath += prxself.vurle;
			                            
			                             // req.url string
			                            var requrls = URL.parse(req.url, true, true);
			                            
			                            // like href="ruyier/"
			                            var hrefstrs = href.split('"');
			                            var hrefpath = hrefstrs[1];
			                            
			                            // append vPath
			                            return (hrefstrs[0]+'"'+
			                                    ((hrefpath[0] === '/') ? vurlpath : (vurlpath + requrls.path + '/'))+
			                                    hrefstrs[1]+ '"');
		                            }
		                        });
		                        
		                        // in case full proxy mode, embedded peer-proxy.js and jquery.js in head
		                        if ((level === 'both') && (/<head(\s|\S)*\/head>/gi).test(hb)) {
		                        	if (!hb.match(/(jquery\.js)|(jquery\.min\.js)/gi)) {
				                        hb = hb.replace(/<\/head>/gi, function(html){
				                            var text = '<script type="text/javascript" src="/vstatic/jquery-2.0.3.min.js"></script>';
				                            return text + html;
				                        });
			                        }
				                    
				                    if (!hb.match(/(peer-proxy\.js)|(peer-proxy\.min\.js)/gi)) {
				                        hb = hb.replace(/<\/head>/gi, function(html){
				                            var text = '<script type="text/javascript" src="/vstatic/peer-proxy.js"></script>';
				                            return text + html;
				                        });
			                        }
		                        }
	                        		                        
		                        return hb;
		                    });
		                    
		                    // 3.5.5.2.1
			                // rewrite href host part in other case
	                        // TBD ...
                        }
                        
                        ///console.log('after rewrite:'+JSON.stringify(resstr.match(vURL.regex_url)));
		                if (Debug > 1) console.log('overwrote text response:'+resstr);
                        
                        // 3.6
                        // send overwrote text out
                        res.writeHead = _res_writeHead;
						res.write = _res_write;
						res.end = _res_end;
						
						var encbuf = Iconv.encode(resstr, charset);
						
			            // rewrite content-length
                        res.setHeader('content-length', encbuf.length);
                        res.writeHead = _res_writeHead;
                        res.writeHead(reshed.statusCode || 200);
                        
						res.end(encbuf);
		            };
	            }
	        }
	        
	        // 4.
	        // ...
	        
	        // 5.
	        // redirection to another host
	        // notes: httpp-proxy internal logics has handled same host case
	        function isLocalhost(host){
			    return ((host === 'localhost') || (host === '127.0.0.1') ||
			            (host === '0:0:0:0:0:0:0:1') || (host === '::1'));
            }
            
            if (Debug) console.log('response.statusCode:'+response.statusCode);
            
            // 3xx redirection
		    if ((response.statusCode >= 300 && response.statusCode < 400) &&
		         typeof response.headers.location !== 'undefined') {
		        if (Debug) console.log('Proxy redirection response,'+'response.headers:'+JSON.stringify(response.headers)+
		                    ',oriReqHost:'+prxself.oriReqHost);
		          
		        var location  = URL.parse(response.headers.location, true, true);
		        var oriReqUrl = URL.parse((prxself.source.https ? 'https://' : 'http://')+prxself.oriReqHost, true, true);
		        var sameHost, samePort, sameProto;
		        
		        // handle default port
		        location.port  = location.port || ((location.protocol === 'https:') ? 443 : 80);
		        oriReqUrl.port = oriReqUrl.port || ((oriReqUrl.protocol === 'https:') ? 443 : 80);
       
		        if (Debug) console.log('\n\noriReqUrl:'+JSON.stringify(oriReqUrl)+'\nlocation:'+JSON.stringify(location));
		        
		        sameHost  = ((location.hostname === oriReqUrl.hostname) || 
			                 (isLocalhost(location.hostname) && isLocalhost(oriReqUrl.hostname)));
			                  
			    samePort  = (location.port === oriReqUrl.port);
			                  
			    sameProto = (location.protocol === (prxself.source.https ? 'https:':'http:'));
		        
		        // rewrite res.headers.location for redirection to the different target response
		        if (!(sameHost && samePort && sameProto)) {
		            // 5.1
                    // add proxy for redirection location
                    // like http://www.google.com/
		            var locvurl = self.addURL(response.headers.location);
                    if (Debug) console.log('redirection:'+response.headers.location+' -> '+locvurl);
                    
                    // 5.2
                    // calculate replaced string
		            response.headers.location = locvurl;
		        }
		    }
		    
	    	// 6.
            // rewrite domain of set-cookie from response.headers
            // TBD... rewrite it with proxy url domain
            var regexsc1 = new RegExp('domain=[a-z0-9-\.]+;', 'gi');
            var regexsc2 = new RegExp('domain=[a-z0-9-\.]+', 'gi');
            
            if (response.headers['set-cookie']) {
                for (var idx = 0; idx < response.headers['set-cookie'].length; idx ++) {
                    if (response.headers['set-cookie'][idx].match(regexsc1)) {
                        response.headers['set-cookie'][idx] = response.headers['set-cookie'][idx].replace(regexsc1, '');
                    } else {
                        response.headers['set-cookie'][idx] = response.headers['set-cookie'][idx].replace(regexsc2, '');
                    }
                }
                
                if (Debug) console.log('\nRewrote set-cookie response,'+'response.headers:'+JSON.stringify(response.headers)); 
            }   
	    });
    }
    
    // 7.
    // push to parent URL cache
    if (!(oriUrl in self.proxyChd)) {
        self.proxyChd[oriUrl] = [];
    
	    if (vURL.regex_url.test(purl) && (purl in self.proxyChd)) {
	        self.proxyChd[purl].push(oriUrl);
	        self.proxyPrn[oriUrl] = purl;
	    }
    }
    
	// 8.
    // caulculate vhost-based vURL
    return self.proxyURL[oriUrl] = (self.nmcln.vmode === vURL.URL_MODE_HOST) ? 
                                    vstrs[0]+'//'+vurle+vstrs[1]+path : vstrs[0]+'//'+vstrs[1]+vurle+path;
};

// delete URL proxy entry
Proxy.prototype.delURL = function(oriUrl){
    var sUrl  = oriUrl.match(/^(http:\/\/)|^(https:\/\/)/gi)? oriUrl : 'http://'+oriUrl;
    
    var self  = this;
    var urls  = URL.parse(sUrl, true, true);
    var host  = urls.hostname;
    var proto = urls.protocol || 'http:';
    var port  = urls.port || ((proto === 'wss:' || proto === 'https:')? 443 : 80);
    var path  = urls.path;
    
    var urle  = proto+'//'+urls.host; // proto+host striped path part of URL
    
    
    // check urls
    if (!host) {
        console.log('invalid URL to proxy: '+oriUrl);
        return null;
    }
    
    // vURL string format
    var vstrs = self.nmcln.vurl.split('//');
    var wstrs = siphash.hash_hex(sipkey, urle);
    var vurle = (self.nmcln.vmode === vURL.URL_MODE_HOST) ? 'p'+wstrs+'p-' : '-p'+wstrs+'p';
    
    ///console.log('del proxy url:'+oriUrl);
    
    if (self.proxyCache[vurle]) self.proxyCache[vurle] = null;
    if (self.proxyURL[oriUrl]) self.proxyURL[oriUrl] = null;
    
    // clear children cache
    if (self.proxyChd[oriUrl]) {
        self.proxyChd[oriUrl].forEach(function(e){
            self.delURL(e);
        });
        self.proxyChd[oriUrl] = null;
    }
    
    // clear parent cache
    if (self.proxyPrn[oriUrl]) {
        self.proxyPrn[oriUrl] = null;
    }
    
    return self;
};

// class methods

