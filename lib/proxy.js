// Copyright (c) 2013 Tom Zhou<zs68j2ee@gmail.com>

var WEBPP = require('iwebpp.io'),
    SEP = WEBPP.SEP,
    httppProxy = require('httpp-proxy'),
    express = require('express'),
    url = require('url');


// Proxy class
// a proxy will contain one iwebpp.io name-client
var Proxy = module.exports = function(websites, fn, usrkey, domain){ // array like ['http://sohu.com', 'https://google.com'] 
    var self = this;
       
    if (!(this instanceof Proxy)) return new Proxy(websites, fn, usrkey, domain);
    
    if (!Array.isArray(websites)) websites = [websites];
    
    // 0.
    // proxy cache and URLs
    self.proxyCache = {};
    self.proxyURL   = {};
    
    // 1.
    // create name client
    var nmcln = self.nmcln = new WEBPP({
        usrinfo: {domain: domain || '51dese.com', usrkey: usrkey || 'dese'}
    });
	    
	nmcln.on('ready', function(){
	    console.log('name-client ready on vpath:'+nmcln.vpath);
		    
	    // 2.
	    // creat http and websocket proxy App
	    var appHttp = express();
	    var appWs   = express();
	    
	    // 3. 
	    // setup proxy App
	    for (var idx = 0; idx < websites.length; idx ++) {
	        var urls  = url.parse(websites[idx], true, true);
	        
	        ///console.log('website:'+websites[idx]);
	        
	        // http proxy
		    appHttp.use('/'+urls.protocol+urls.host, self.proxyHttp(websites[idx]));
		    
		    // websocket proxy
		    appWs.use('/'+urls.protocol+urls.host, self.proxyWebsocket(websites[idx]));
		    
		    self.proxyURL[websites[idx]] = nmcln.vurl+'/'+urls.protocol+urls.host;
	    }
	    appHttp.use(function(req, res){
		    res.end('unknown website');
		});
	    
	    // 4.
	    // create shell App, then hook proxy App
	    
	    // 4.1
	    // http shell App
	    var shellHttp = express();
	    		    
	    shellHttp.use(nmcln.vpath, appHttp);
	    nmcln.bsrv.srv.on('request', shellHttp);
	    
	    // 4.2
	    // websocket shell App
	    var shellWs = express();
	    
	    shellWs.use(nmcln.vpath, appWs);
	    nmcln.bsrv.srv.on('upgrade', shellWs);
	    
	    // 5.
	    // pass proxy URLs back
	    fn(null, self.proxyURL);
	});
};

// instance methods

// proxy for http request
Proxy.prototype.proxyHttp = function(website){ // like https://www.google.com
    var self  = this;
    var urls  = url.parse(website, true, true);
    var host  = urls.hostname;
    var proto = urls.protocol;
    var port  = urls.port || (proto === 'https:' ? 443 : 80);
    
    
    ///console.log('website URL:'+JSON.stringify(urls));
    
    return function(req, res){
		// cache proxy
        if (!self.proxyCache[website]) {
            // create proxy to target
            self.proxyCache[website] = new httppProxy.HttpProxy({
                httpp: true,
                
                forward: {
                   httpp: false, 
                    
                     host: host,
                     port: port,
                    https: proto === 'https:'
                },
                               
                target: {
                    httpp: false, 
                    
                     host: host,
                     port: port,
                    https: proto === 'https:'
                }
            });
        }
        
        // proxy target
        self.proxyCache[website].proxyRequest(req, res);
        
		// proxy for redirection
		// TBD...
		
		// override response's content href
		// TBD...
    };
};

// proxy for websocket
Proxy.prototype.proxyWebsocket = function(website){ // like https://www.google.com
    var self  = this;
    var urls  = url.parse(website, true, true);
    var host  = urls.hostname;
    var proto = urls.protocol;
    var port  = urls.port || (proto === 'wss:' ? 443 : 80);
    
    
    ///console.log('website URL:'+JSON.stringify(urls));
    
    return function(req, socket, head){
		// cache proxy
        if (!self.proxyCache[website]) {
            // create proxy to target
            self.proxyCache[website] = new httppProxy.HttpProxy({
                httpp: true,
                
                forward: {
                   httpp: false, 
                    
                     host: host,
                     port: port,
                    https: proto === 'wss:'
                },
   
                target: {
                    httpp: false, 
                    
                     host: host,
                     port: port,
                    https: proto === 'wss:'
                }
            });
        }
        
        // proxy target
        self.proxyCache[website].proxyWebSocketRequest(req, socket, head);
        
		// proxy for redirection
		// TBD...
		
		// override response's content href
		// TBD...
    };
};

// class methods

// simple test case
(function(websites){
    var prxy = new Proxy(websites, function(err, proxyURL){
        for (var k in proxyURL) {
            console.log(k+' -> '+proxyURL[k]);
        }
    });
})(['http://localhost:8080', 'http://video.sina.com.cn/']);
