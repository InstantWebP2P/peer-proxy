// Copyright (c) 2013 Tom Zhou<zs68j2ee@gmail.com>

var WEBPP = require('iwebpp.io'),
    SEP = WEBPP.SEP,
    vURL = WEBPP.vURL,
    httppProxy = require('httpp-proxy'),
    URL = require('url'),
    zlib = require('zlib'),
    Buffer = require('buffer').Buffer,
    Iconv = require('iconv-lite'),
    Jschardet = require("jschardet"),
    Connect = require('connect'),
    trumpet = require('trumpet');
    
// security hash
// sipkey can be any user defined 4 integers
var siphash = require('siphash'),
    sipkey = [0x66662222, 0x86868686, 0x66665555, 0x33339999]; // magic key

// helpers
var REGEX_URL  = new RegExp('(https?)://[a-z0-9-]+(\.[a-z0-9-]+)+(/?)', 'gi');

var REGEX_HREF = new RegExp('href="(/?)[a-z0-9-/\.]+(/?)"', 'gi');

// debug level
// 1: display error, proxy entry
// 2: display req/res headers/statusCode
var debug = 0;

// Proxy class
// a proxy will contain one iwebpp.io name-client
// -        websites: array of web site/service URL, like ['http://sohu.com', 'https://google.com'] 
// -              fn: callback to pass proxy informations
// -         options: user custom parameters, like {secmode: ..., keyword: ..., usrkey: ..., domain: ..., endpoints: ..., turn: ...}
// - options.keyword: array of text used to generate proxy in text/html response automatically
// - options.secmode: ssl, enable ssl/https; acl, enable ssl/https,host-based ACL
var Proxy = module.exports = function(websites, fn, options){ 
    var self = this;
       
    if (!(this instanceof Proxy)) return new Proxy(websites, fn, options);
    
    if (!Array.isArray(websites)) websites = [websites];
        
    // 0.
    // proxy cache and URLs
    self.proxyCache = {}; // http proxy for website
    self.proxyURL   = {}; // vURL for website
    self.proxyChd   = {}; // child link in websites
    
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
                {ip: 'iwebpp.com', port: 51686},
                {ip: 'iwebpp.com', port: 51868}
            ],
            turn: (options && options.turn) || [
                {ip: 'iwebpp.com', agent: 51866, proxy: 51688}
            ]
        },
        
        // vURL mode: vhost-based
        vmode: vURL.URL_MODE_HOST, 
          
        // secure mode
        secmode: (options && options.secmode === 'acl') ? SEP.SEP_SEC_SSL_ACL_HOST : SEP.SEP_SEC_SSL
    });
	
	// 1.1
	// check ready
	nmcln.on('ready', function(){
	    if (debug) console.log('name-client ready on vURL:'+nmcln.vurl);
	    
	    // 2.
	    // setup proxy App
	    // notes: main URL entry without parent URL
	    for (var idx = 0; idx < websites.length; idx ++) 
	        self.addURL(websites[idx], {keyword: (options && options.keyword) || []}); 
	    
	    // 3.
	    // http proxy
	    
	    // website vhost regex as p(16hex)p.
	    var vhostregex = /p([0-9]|[a-f]){16}p\./i;
	    var vpathregex = /\/p([0-9]|[a-f]){16}p/i;
	    
	    var proxyHttp = function(req, res){
	        var vstrs, vurle;
	        
	        // 3.1
	        // check vURL
	        if ((self.nmcln.vmode === vURL.URL_MODE_HOST) &&
	            (vstrs = req.headers.host.match(vhostregex))) {
	            vurle = vstrs[0];
	        } else if ((self.nmcln.vmode === vURL.URL_MODE_PATH) &&
	                   (vstrs = req.url.match(vpathregex))) {
	            vurle = vstrs[0];
	            
	            // 3.1.1
	            // prune vpath in req.url
	            req.url = req.url.replace(vpathregex, '');
	        } else {
                // invalid vURL
                res.writeHead(400);
                res.end('invalid URL');
                if (debug) console.error('invalid vURL:'+JSON.stringify(req.headers));
                return;
	        }
	        
            // 3.2
            // proxy target
            if (self.proxyCache[vurle]) {
                self.proxyCache[vurle].proxyRequest(req, res);
            } else {
                // unknown vURL
                res.writeHead(400);
                res.end('unknown vURL');
                if (debug) console.error('unknown vURL:'+JSON.stringify(req.headers));
                    return;
            }
	    };
	    
	    // 4.
	    // create http proxy App
	    var appHttp = Connect();
	    
	    // 4.1
	    // add third-party connect middle-ware
	    
	    // 4.1.2
	    // compress
	    // TBD...
	    ///appHttp.use(Connect.compress());
	    
	    // 4.1.3
	    // cache
	    ///appHttp.use(Connect.staticCache({maxLength: 512*1024, maxObjects: 64}));
	    
	    // 4.2
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
	            
	            // 5.1.1
	            // prune vpath in req.url
	            req.url = req.url.replace(vpathregex, '');
	        } else {
	            // invalid vURL, nothing to do
	            // MUST not close socket, which will break other upgrade listener
                if (debug) console.error('invalid URL:'+JSON.stringify(req.headers));
                return;
	        }
	        	        
	        // 5.3
            // proxy target
            if (self.proxyCache[vurle]) {
                self.proxyCache[vurle].proxyWebSocketRequest(req, socket, head);
            } else {
                // unknown vURL
                socket.end('unknown vURL');
                if (debug) console.error('unknown vURL:'+JSON.stringify(req.headers));
                return;
            }
	    };
	    
	    // 6.
	    // hook App on name-client
	    nmcln.bsrv.srv.on('request', appHttp);	
	    nmcln.bsrv.srv.on('upgrade', appWs);
	    
	    // 7.
	    // pass proxy URLs back
	    fn(null, self.proxyURL);
	    
    	// 8.
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
        
        // 8.1
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
// options: {purl: ..., keyword: ...}
// -    purl: parent or root URL 
// - keyword: array of text used to generate proxy in text/html response
Proxy.prototype.addURL = function(urle, options){
    var self  = this;
    var urls  = URL.parse(urle, true, true);
    var host  = urls.hostname;
    var proto = urls.protocol || 'http:';
    var port  = urls.port || ((proto === 'wss:' || proto === 'https:')? 443 : 80);
    var path  = urls.path;
    
    
    // check options
    var purl    = (options && options.purl) || '';
    var keyword = (options && options.keyword) || [];
    
    function matchKeyword(url, kw) {
        var matched = false;
        
        for (var idx = 0; idx < kw.length; idx ++) 
            if (url.match(kw[idx])) {
                matched = true;
                break;
            }
        
        return matched;
    }
    
    // vURL string format, like pxxxp. in vhost mode or /pxxxp in vpath mode
    var vstrs = self.nmcln.vurl.split('//');
    var wstrs = siphash.hash_hex(sipkey, (proto+urls.host).replace(/:/gi, '-').replace(/\./gi,'-'));
    var vurle = (self.nmcln.vmode === vURL.URL_MODE_HOST) ? 'p'+wstrs+'p.' : '/p'+wstrs+'p';

    ///console.log('add proxy url:'+urle);
    
    // 1.
    // create proxy to target
    if (!(self.proxyCache[vurle] && self.proxyURL[urle])) {
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
	    
	    // hook vurle in httpProxy instance
	    self.proxyCache[vurle].vurle = vurle;
	    
	    // 1.1
	    // Handle request error
	    self.proxyCache[vurle].on('proxyError', function(err, req, res){
	        if (debug) console.error(err+',proxy to '+urle);
	        
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
	        if (debug) console.error(err+',proxy to '+urle);
	        
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
	        if (debug) console.log('Proxy response,'+'req.headers:'+JSON.stringify(req.headers)+
	                               '\n\n,response.statusCode:'+response.statusCode+',response.headers:'+JSON.stringify(response.headers));
	        
	        // 3.
	        // rewrite href from text/html response for whole website proxy
	        if ((response.statusCode === 200) && 
	            ('content-type' in response.headers) && 
	            (response.headers['content-type'].match('text/html') ||
	             response.headers['content-type'].match('text/xml'))) {
	            if (debug) console.log('Proxy 200 response,'+'response.headers:'+JSON.stringify(response.headers));
	            	               
	            // 3.1
	            // intercept res.write and res.end 
	            // notes:
	            // - unzip and zip again
	            // - ...
	            var resbuf = [];
	            var ressiz = 0;
	            var resstr = '';
	            var _res_write = res.write, _res_end = res.end;
	            var _decomp, _encomp, _codec;
	            
	            // 3.2
	            // handle compressed text
	            if (('content-encoding' in response.headers) &&
	                (response.headers['content-encoding'].match('gzip') ||
	                 response.headers['content-encoding'].match('deflate'))) {
	                if (debug) console.log('Proxy ziped response,'+'response.headers:'+JSON.stringify(response.headers));
	                 
	                if (response.headers['content-encoding'].match('gzip')) {
	                    _codec  = 'gzip';
	                    _decomp = zlib.createGunzip();
	                    _encomp = zlib.createGzip();
	                } else {
	                    _codec  = 'deflate';
	                    _decomp = zlib.createInflate();
	                    _encomp = zlib.createDeflate();
	                }
	               	                
	                if (debug) console.log('\n\ngzip');
                
                    // 3.3
                    // in case handle Node.js-not-supported charset
                    // - detect charset
	                // - decode content by charset 
	                // - rewrite resstr
	                // - send rewrote resstr by charset
	                // - force response on utf-8 charset??? TBD...
	                /*
	                if (response.headers['content-type'].match('charset=')) {
	                
	                } else {
	                    // append utf-8 charset
	                    
	                }*/
	                	                    
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
		                
		                if (debug) console.log('charset:'+JSON.stringify(chardet));
		                		                
		                // 3.3.3
		                // decode content by charset
		                resstr = Iconv.decode(bigbuf, charset);
		                                
                        if (debug > 1) console.log('text response:'+resstr);
                        
                        // 3.3.4
                        // rewrite text content            
                        ///console.log('before rewrite:'+JSON.stringify(resstr.match(REGEX_URL)));
                        
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
                        // rewrite href host part
                        resstr = resstr.replace(REGEX_URL, function(href){
                            // like http://www.google.com/
                            var hrefstr  = href.split('/');
                            var hrefurl  = URL.parse(href, true, true);
                            var hrefhost = hrefstr[0]+'//'+hrefstr[2];
                                
                            // replace for original host URL
                            // original host domain like xxx.com, xxx.cn
                            // notes: replace for keyword matched URL
                            var origstrs = urls.hostname.split(/\./gi);
                            var orighost = origstrs[origstrs.length-2] || 'localhost';
                            
                            if (debug) console.log('original hostname:'+urls.hostname+',orighost:'+orighost);
                            
                            if ((/(\.|localhost)/gi).test(hrefhost) && 
                                (hrefhost.match(orighost) || matchKeyword(hrefhost, keyword))) {
                                // add proxy for child href 
                                var hrefvurl = self.addURL(hrefhost, {purl: urle, keyword: keyword});
                                if (debug) console.log('zipped text/html:'+hrefhost+' -> '+hrefvurl);
                                
                                // calculate replaced string
                                return (hrefvurl + ((hrefstr.length > 3)? hrefurl.path : ''));
                            } else {
                                return href;
                            }
                        });
                        
                        // 3.3.4.2
                        // rewrite href path part in case vpath-based vURL mode
                        if (self.nmcln.vmode === vURL.URL_MODE_PATH) {
	                        resstr = resstr.replace(REGEX_HREF, function(href){
	                            if (debug) console.log('href:'+href);
	                        
	                            // skip on host-based rewrite
	                            if (href.match(REGEX_URL)) {
	                                return href;
	                            } else {
	                                // vURL string
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
                        }
                        
                        ///console.log('after rewrite:'+JSON.stringify(resstr.match(REGEX_URL)));
		                if (debug > 1) console.log('overwrote text response:'+resstr);
                        
                        // 3.3.5
                        // compress overwrote text and send out
                        if (_codec === 'gzip') {
                            zlib.gzip(Iconv.encode(resstr, charset), function(err, buffer) {
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
                            zlib.deflate(Iconv.encode(resstr, charset), function(err, buffer) {
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
                    
	                res.write = function(trunk){
	                    return _decomp.write(trunk);
	                };
	                res.end = function(trunk){
	                    _decomp.end(trunk);
	                };
	            } else {
	                if (debug) console.log('\n\nnotzip');
	                
	                // 3.5
	                // in case handle Node.js-not-supported charset
                    // - detect charset
	                // - decode content by charset 
	                // - rewrite resstr
	                // - send rewrote by charset
	                // - force response on utf-8 charset??? TBD...
	                /*
	                if (response.headers['content-type'].match('charset=')) {
	                
	                } else {
	                    // append utf-8 charset
	                    
	                }*/
	                
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
		                
		                if (debug) console.log('charset:'+JSON.stringify(chardet));
		                		                
		                // 3.5.4
		                // decode content by charset
		                resstr = Iconv.decode(bigbuf, charset);
		                
		                if (debug > 1) console.log('text response:'+resstr);
		                
                        // 3.5.5
                        // rewrite text content
                        ///console.log('before rewrite:'+JSON.stringify(resstr.match(REGEX_URL)));
                        
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
                        // rewrite href host part
                        resstr = resstr.replace(REGEX_URL, function(href){
                            // like http://www.google.com/
                            var hrefstr  = href.split('/');
                            var hrefurl  = URL.parse(href, true, true);
                            var hrefhost = hrefstr[0]+'//'+hrefstr[2];
                                
                            // replace for original host URL
                            // original host domain like xxx.com, xxx.cn
                            // notes: replace for keyword matched URL
                            var origstrs = urls.hostname.split(/\./gi);
                            var orighost = origstrs[origstrs.length-2] || 'localhost';
                            
                            if (debug) console.log('original hostname:'+urls.hostname+',orighost:'+orighost);
                            
                            if ((/(\.|localhost)/gi).test(hrefhost) && 
                                (hrefhost.match(orighost) || matchKeyword(hrefhost, keyword))) {
                                // like http://www.google.com/
                                var hrefstr  = href.split('/');
                                var hrefurl  = URL.parse(href, true, true);
                                var hrefhost = hrefstr[0]+'//'+hrefstr[2];
                                
                                // 3.5.5.1
                                // add proxy for child href 
                                var hrefvurl = self.addURL(hrefhost, {purl: urle, keyword: keyword});
                                if (debug) console.log('plain text/html:'+hrefhost+' -> '+hrefvurl);
                                
                                // 3.5.5.2
                                // calculate replaced string
                                return (hrefvurl + ((hrefstr.length > 3)? hrefurl.path : ''));
                            } else {
                                return href;
                            }
                        });
                        
                        // 3.5.5.2
                        // rewrite href path part in case vpath-based vURL mode
                        if (self.nmcln.vmode === vURL.URL_MODE_PATH) {
	                        resstr = resstr.replace(REGEX_HREF, function(href){
	                            if (debug) console.log('href:'+href);
	                            
	                            // skip on host-based rewrite
	                            if (href.match(REGEX_URL)) {
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
                        }
                        
                        ///console.log('after rewrite:'+JSON.stringify(resstr.match(REGEX_URL)));
		                if (debug > 1) console.log('overwrote text response:'+resstr);
                        
                        // 3.6
                        // send overwrote text out
						res.write = _res_write;
						res.end = _res_end;
						
						res.end(Iconv.encode(resstr, charset));
		            };
	            }
	        }
	        
	        // 4.
	        // ...
	        
	        // 5.
	        // redirection to another host
	        // notes: httpp-proxy internal logics has handled same host case
	        function isLocalhost(host){
                return ((host === 'localhost') || (host === '127.0.0.1') || (host === '0:0:0:0:0:0:0:1'));
            }
    
		    if ((response.statusCode === 301 || response.statusCode === 302) &&
		         typeof response.headers.location !== 'undefined') {
		        if (debug) console.log('Proxy redirection response,'+'response.headers:'+JSON.stringify(response.headers)+
		                    ',oriReqHost:'+prxself.oriReqHost);
		          
		        var location  = URL.parse(response.headers.location, true, true);
		        var oriReqUrl = URL.parse((prxself.source.https ? 'https://' : 'http://')+prxself.oriReqHost, true, true);
		        var sameHost, samePort, sameProto;
		        
		        // handle default port
		        location.port  = location.port || ((location.protocol === 'https:') ? 443 : 80);
		        oriReqUrl.port = oriReqUrl.port || ((oriReqUrl.protocol === 'https:') ? 443 : 80);
       
		        if (debug) console.log('\n\noriReqUrl:'+JSON.stringify(oriReqUrl)+'\nlocation:'+JSON.stringify(location));
		        
		        sameHost  = ((location.hostname === oriReqUrl.hostname) || 
			                 (isLocalhost(location.hostname) && isLocalhost(oriReqUrl.hostname)));
			                  
			    samePort  = (location.port === oriReqUrl.port);
			                  
			    sameProto = (location.protocol === (prxself.source.https ? 'https:':'http:'));
		        
		        // rewrite res.headers.location for redirection to the different target response
		        if (!(sameHost && samePort && sameProto)) {
		            // 5.1
                    // add proxy for redirection location
                    // like http://www.google.com/
                    var locstr  = response.headers.location.split('/');
		            var locvurl = self.addURL(response.headers.location, {purl: urle, keyword: keyword});
                    if (debug) console.log('redirection:'+response.headers.location+' -> '+locvurl);
                                
                    // 5.2
                    // calculate replaced string
		            response.headers.location = (locvurl + ((locstr.length > 3)? location.path : ''));
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
                
                if (debug) console.log('\nRewrote set-cookie response,'+'response.headers:'+JSON.stringify(response.headers)); 
            }   
	    });
	    
	    // 7.
	    // caulculate vhost-based vURL
	    self.proxyURL[urle] = (self.nmcln.vmode === vURL.URL_MODE_HOST) ? 
	                           vstrs[0]+'//'+vurle+vstrs[1]+path : vstrs[0]+'//'+vstrs[1]+vurle+path;
	    
	    self.proxyChd[urle] = [];
	    
	    // 7.1
	    // push to parent URL cache
	    if (REGEX_URL.test(purl) && (purl in self.proxyChd)) {
	        self.proxyChd[purl].push(urle);
	    }
    }
    
    // 8.
    // return vURL host string
    return ((self.nmcln.vmode === vURL.URL_MODE_HOST) ? 
	         vstrs[0]+'//'+vurle+vstrs[1] : vstrs[0]+'//'+vstrs[1]+vurle);
};

// delete URL proxy entry
Proxy.prototype.delURL = function(urle){
    var self  = this;
    var urls  = URL.parse(urle, true, true);
    var host  = urls.hostname;
    var proto = urls.protocol || 'http:';
    var port  = urls.port || ((proto === 'wss:' || proto === 'https:')? 443 : 80);
    var path  = urls.path;
    
    // vURL string format
    var vstrs = self.nmcln.vurl.split('//');
    var wstrs = siphash.hash_hex(sipkey, (proto+urls.host).replace(/:/gi, '-').replace(/\./gi,'-'));
    var vurle = (self.nmcln.vmode === vURL.URL_MODE_HOST) ? 'p'+wstrs+'p.' : '/p'+wstrs+'p';
    
    ///console.log('del proxy url:'+urle);
    
    if (self.proxyCache[vurle]) self.proxyCache[vurle] = null;
    if (self.proxyURL[urle]) self.proxyURL[urle] = null;
    
    // clear children cache
    if (self.proxyChd[urle]) {
        self.proxyChd[urle].forEach(function(e){
            self.delURL(e);
        });
        self.proxyChd[urle] = null;
    }
};

// class methods

