// Copyright (c) 2013 Tom Zhou<zs68j2ee@gmail.com>

var WEBPP = require('iwebpp.io'),
    SEP = WEBPP.SEP,
    vURL = WEBPP.vURL,
    httppProxy = require('httpp-proxy'),
    URL = require('url'),
    zlib = require('zlib');

var siphash = require('siphash'),
    key = [0x66662222, 0x86868686, 0x66665555, 0x33339999]; // magic key

// helpers
var REGEX_URL  = new RegExp('(https?)://[a-z0-9-]+(\.[a-z0-9-]+)+(/?)', 'gi');

// debug level
// 1: display error, proxy entry
// 2: display req/res headers/statusCode
var debug = 0;

// Proxy class
// a proxy will contain one iwebpp.io name-client
var Proxy = module.exports = function(websites, fn, usrkey, domain){ // array like ['http://sohu.com', 'https://google.com'] 
    var self = this;
       
    if (!(this instanceof Proxy)) return new Proxy(websites, fn, usrkey, domain);
    
    if (!Array.isArray(websites)) websites = [websites];
        
    // 0.
    // proxy cache and URLs
    self.proxyCache = {}; // http proxy for website
    self.proxyURL   = {}; // vURL for website
    self.proxyChd   = {}; // child link in websites
    
    // 1.
    // create name client
    var nmcln = self.nmcln = new WEBPP({
        usrinfo: {domain: domain || '51dese.com', usrkey: usrkey || 'dese'},
        
        srvinfo: {
            timeout: 20,
            endpoints: [{ip: 'iwebpp.com', port: 51686}, {ip: 'iwebpp.com', port: 51868}],
            turn: [
                {ip: 'iwebpp.com', agent: 51866, proxy: 51688} // every turn-server include proxy and agent port
            ]
        }
    });
	
	// 1.1
	// check ready
	nmcln.on('ready', function(){
	    console.log('name-client ready on vURL:'+nmcln.vurl);
	    
	    // 2.
	    // setup proxy App
	    for (var idx = 0; idx < websites.length; idx ++) 
	        self.addURL(websites[idx]);
	    
	    // 3.
	    // creat http proxy App
	    
	    // website vhost regex, like -16hex-.
	    var vhostregex = /z([0-9]|[a-f]){16}s\./i;
	    var vpathregex = /\/z([0-9]|[a-f]){16}s\//i;
	    
	    var appHttp = function(req, res){
	        var vstrs, vurle;
	        
	        if ((self.nmcln.vmode === vURL.URL_MODE_HOST) &&
	            (vstrs = req.headers.host.match(vhostregex))) {
	            vurle = vstrs[0];
	        } else if ((self.nmcln.vmode === vURL.URL_MODE_PATH) &&
	                   (vstrs = req.url.match(vpathregex))) {
	            vurle = vstrs[0];
	        } else {
	            // invalid vURL
	            res.writeHead(400);
                res.end('invalid vURL:'+JSON.stringify(req.headers));
                return;
	        }
	        
        	// proxy target
            if (self.proxyCache[vurle]) {
                self.proxyCache[vurle].proxyRequest(req, res);
            } else {
                // unknown vURL
	            res.writeHead(400);
                res.end('unknown vURL:'+JSON.stringify(req.headers));
                return;
            }
	    };
	    
	    // 5.
	    // websocket proxy App
	    var appWs = function(req, socket, head){
	        var vstrs, vurle;
	        
	        if ((self.nmcln.vmode === vURL.URL_MODE_HOST) &&
	            (vstrs = req.headers.host.match(vhostregex))) {
	            vurle = vstrs[0];
	        } else if ((self.nmcln.vmode === vURL.URL_MODE_PATH) &&
	                   (vstrs = req.url.match(vpathregex))) {
	            vurle = vstrs[0];
	        } else {
	            // invalid vURL
                socket.end('invalid vURL:'+JSON.stringify(req.headers));
                return;
	        }
	       
            // proxy target
            if (self.proxyCache[vurle]) {
                self.proxyCache[vurle].proxyWebSocketRequest(req, socket, head);
            } else {
                // unknown vURL
                socket.end('unknown vURL:'+JSON.stringify(req.headers));
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
Proxy.prototype.addURL = function(urle, purl){
    var self  = this;
    var urls  = URL.parse(urle, true, true);
    var host  = urls.hostname;
    var proto = urls.protocol || 'http:';
    var port  = urls.port || ((proto === 'wss:' || proto === 'https:')? 443 : 80);
    var path  = urls.path;
    
    // vURL string format
    var vstrs = self.nmcln.vurl.split('//');
    var wstrs = siphash.hash_hex(key, (proto+urls.host).replace(/:/gi, '-').replace(/\./gi,'-'));
    var vurle = (self.nmcln.vmode === vURL.URL_MODE_HOST) ? 'z'+wstrs+'s.' : '/z'+wstrs+'s';

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
	    
	    // 1.1
	    // Handle proxy error
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
	        self.delURL(urle);
	    });
	    
	    // 2.
	    // Handle custom overwrite logics on response
	    self.proxyCache[vurle].on('proxyResponse', function(req, res, response){
	        var prxself = this;
	        ///console.log('Proxy response,'+'req.headers:'+JSON.stringify(req.headers)+
	        ///            '\n\n,response.statusCode:'+response.statusCode+',response.headers:'+JSON.stringify(response.headers));
	        
	        // 3.
	        // overwrite href from text/html response for whole website proxy
	        if ((response.statusCode === 200) && 
	            (response.headers['content-type'].match('text/html'))) {
	            ///console.log('Proxy 200 response,'+'response.headers:'+JSON.stringify(response.headers));
	               
	            // 3.1
	            // intercept res.write and res.end 
	            // notes:
	            // - unzip and zip again
	            // - ...
	            var resbuf = '';
	            var _res_write = res.write, _res_end = res.end;
	            var _decomp, _encomp, _codec;
	            
	            
	            // 3.2
	            // handle compressed text
	            if (('content-encoding' in response.headers) &&
	                (response.headers['content-encoding'].match('gzip') ||
	                 response.headers['content-encoding'].match('deflate'))) {
	                ///console.log('Proxy ziped response,'+'response.headers:'+JSON.stringify(response.headers));
	                 
	                if (response.headers['content-encoding'].match('gzip')) {
	                    _codec  = 'gzip';
	                    _decomp = zlib.createGunzip();
	                    _encomp = zlib.createGzip();
	                } else {
	                    _codec  = 'deflate';
	                    _decomp = zlib.createInflate();
	                    _encomp = zlib.createDeflate();
	                }
	               	                
	                ///console.log('\n\ngzip');
	                
	                // 3.2.1
	                // uncompress text
	                ///_decomp.setEncoding('utf8');
	                
	                _decomp.on('data', function(text) {
                        if (text) resbuf += text;
                    });
                    _decomp.on('end', function() {                
                        ///console.log('text response:'+resbuf);
                        
                        // 3.2.2
                        // overwrite text content            
                        ///console.log('before overwrite:'+JSON.stringify(resbuf.match(REGEX_URL)));
                        resbuf = resbuf.replace(REGEX_URL, function(href){
                            // like http://www.google.com/
                            var hrefstr  = href.split('/');
                            var hrefurl  = URL.parse(href, true, true);
                            var hrefhost = hrefstr[0]+'//'+hrefstr[2];
                                
                            // only replace for original host URL
                            var orighost = (urls.hostname.slice(0, 4) === 'www.') ? urls.hostname.slice(4) : urls.hostname;
                            ///console.log('original hostname:'+urls.hostname+',orighost:'+orighost);
                            
                            if ((/(\.|localhost)/gi).test(hrefhost) && hrefhost.match(orighost)) {
                                // 3.2.2.1
                                // add proxy for child href 
                                var hrefvurl = self.addURL(hrefhost); // TBD... parent href;
                                if (debug) console.log('zipped text/html:'+hrefhost+' -> '+hrefvurl);
                                
                                // 3.2.2.2
                                // calculate replaced string
                                return (hrefvurl + ((hrefstr.length > 3)? hrefurl.path : ''));
                            } else {
                                return href;
                            }
                        });
                        ///console.log('after overwrite:'+JSON.stringify(resbuf.match(REGEX_URL)));
		                ///console.log('overwrote text response:'+resbuf);
                        
                        // 3.2.3
                        // compress overwrote text and send out
                        if (_codec === 'gzip') {
                            zlib.gzip(resbuf, function(err, buffer) {
                                if (err) {
                                    console.log(err+',deflate failed');
                                    res.emit('error', err+',gzip failed');
                                } else {
			                        if (_res_write.call(res, buffer)) {
					                    _res_end.call(res);
					                } else {
					                    res.on('drain', function(){
					                        _res_end.call(res);
					                    });
					                }
                                }
                            });
                        } else {
                            zlib.deflate(resbuf, function(err, buffer) {
                                if (!err) {
                                    console.log(err+',deflate failed');
                                    res.emit('error', err+',deflate failed');
                                } else {
			                        if (_res_write.call(res, buffer)) {
					                    _res_end.call(res);
					                } else {
					                    res.on('drain', function(){
					                        _res_end.call(res);
					                    });
					                }
                                }
                            });                        
                        }
                    });
                    
                    // 3.3
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
	                console.log('\n\nnotzip');
	                
	                // 3.4
	                // hanlde plain text
	                
	                // 3.4.1
	                // intercept res.write and res.end to buffer text	                
		            res.write = function(text){
		                if (text) resbuf += text;
		                return true;
		            };
		            res.end = function(text){
		                if (text) resbuf += text;
		                ///console.log('text response:'+resbuf);
		                
                        // 3.4.2
                        // overwrite text content
                        ///console.log('before overwrite:'+JSON.stringify(resbuf.match(REGEX_URL)));
                        resbuf = resbuf.replace(REGEX_URL, function(href){
                            // like http://www.google.com/
                            var hrefstr  = href.split('/');
                            var hrefurl  = URL.parse(href, true, true);
                            var hrefhost = hrefstr[0]+'//'+hrefstr[2];
                                
                            // only replace for original host URL
                            var orighost = (urls.hostname.slice(0, 4) === 'www.') ? urls.hostname.slice(4) : urls.hostname;
                            ///console.log('original hostname:'+urls.hostname+',orighost:'+orighost);
                            
                            if ((/(\.|localhost)/gi).test(hrefhost) && hrefhost.match(orighost)) {
                                // like http://www.google.com/
                                var hrefstr  = href.split('/');
                                var hrefurl  = URL.parse(href, true, true);
                                var hrefhost = hrefstr[0]+'//'+hrefstr[2];
                                
                                // 3.4.2.1
                                // add proxy for child href 
                                var hrefvurl = self.addURL(hrefhost); // TBD... parent href;
                                if (debug) console.log('plain text/html:'+hrefhost+' -> '+hrefvurl);
                                
                                // 3.4.2.2
                                // calculate replaced string
                                return (hrefvurl + ((hrefstr.length > 3)? hrefurl.path : ''));
                            } else {
                                return href;
                            }
                        });
                        ///console.log('after overwrite:'+JSON.stringify(resbuf.match(REGEX_URL)));
		                ///console.log('overwrote text response:'+resbuf);
                        
                        // 3.4.3
                        // send overwrote text out
		                if (_res_write.call(res, resbuf)) {
		                    _res_end.call(res);
		                } else {
		                    res.on('drain', function(){
		                        _res_end.call(res);
		                    });
		                }
		            };
	            }
	        }
	        
	        // 4.
	        // ...
	        
	        // 5.
	        // redirection to another host
		    function isLocalhost(host){
		        return ((host === 'localhost') || (host === '127.0.0.1') || (host === '0:0:0:0:0:0:0:1'));
		    }
		        
		    if ((response.statusCode === 301 || response.statusCode === 302) &&
		         typeof response.headers.location !== 'undefined') {
		        ///console.log('Proxy redirection response,'+'response.headers:'+JSON.stringify(response.headers));
		          
		        var location = URL.parse(response.headers.location, true, true);
		        var sameHost, samePort, sameProto;
		        	        
		        sameHost  = prxself.changeOrigin ?  
		                    ((location.hostname === prxself.target.host) || (isLocalhost(location.hostname) && isLocalhost(prxself.target.host))) :
		                    (location.host === prxself.oriReqHost);
		                  
		        samePort  = prxself.changeOrigin ? 
		                    (location.port === prxself.target.port) :
		                    (location.host === prxself.oriReqHost);
		                  
		        sameProto = (location.protocol === (prxself.target.https ? 'https:':'http:'));
		      
		        // overwrite res.headers.location for redirection to the different target response
		        if (!(sameHost && samePort && sameProto)) {
		            // 5.1
                    // add proxy for redirection location
                    // like http://www.google.com/
                    var locstr  = response.headers.location.split('/');
		            var locvurl = self.addURL(response.headers.location);
                    if (debug) console.log('redirection:'+response.headers.location+' -> '+locvurl);
                                
                    // 5.2
                    // calculate replaced string
		            response.headers.location = (locvurl + ((locstr.length > 3)? location.path : ''));
		        }
		    }
	    });
	    	    
	    // 6.
	    // caulculate vhost-based vURL
	    self.proxyURL[urle] = (self.nmcln.vmode === vURL.URL_MODE_HOST) ? 
	                           vstrs[0]+'//'+vurle+vstrs[1]+path : vstrs[0]+'//'+vstrs[1]+vurle+path;
	    self.proxyChd[urle] = [];
	    
	    // 6.1
	    // push to parent URL cache
	    if (REGEX_URL.test(purl) && self.proxyChd[purl]) {
	        self.proxyChd[purl].push(urle);
	    }
    }
    
    // 7.
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
    var wstrs = siphash.hash_hex(key, (proto+urls.host).replace(/:/gi, '-').replace(/\./gi,'-'));
    var vurle = (self.nmcln.vmode === vURL.URL_MODE_HOST) ? 'z'+wstrs+'s.' : '/z'+wstrs+'s';

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

// simple test cass

(function(websites){
    var prxy = new Proxy(websites, function(err, proxyURL){
        console.log('Website                            Proxy URL(please open it)');
        for (var k in proxyURL) {
            console.log(k+'        '+proxyURL[k]);
        }
    });
})([
    'https://192.188.1.102:3000', 
    'https://192.188.1.101:8443',
    'http://w3schools.com/',
    'http://news.sina.com.cn/',
    'http://sohu.com/'
]);

