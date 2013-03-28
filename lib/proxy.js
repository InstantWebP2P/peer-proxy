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
    
    // one proxy support one website
    // TBD... support multipe website
    if (websites.length > 1) {
        console.log('Only proxy the first website: '+websites[0]);
        console.log('To proxy more website, please create new Proxy instance...');
    }
    
    // 0.
    // proxy cache and URLs
    self.proxyCache = {};
    self.proxyURL   = {};
    
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
	    
	nmcln.on('ready', function(){
	    console.log('name-client ready on vURL:'+nmcln.vurl);
		    
	    // 2.
	    // creat http and websocket proxy App
	    var appHttp = express();
	    var appWs   = express();
	    
	    // 3. 
	    // setup proxy App
	    for (var idx = 0; idx < 1/*websites.length*/; idx ++) {
	        var urls  = url.parse(websites[idx], true, true);
	        
	        ///console.log('website:'+websites[idx]);
	        
	        // http proxy
		    appHttp.use(self.proxyHttp(websites[idx]));
		    
		    // websocket proxy
		    appWs.use(self.proxyWebsocket(websites[idx]));
		    
		    // vhost-based vURL
		    var vstrs = nmcln.vurl.split('//');
		    var wstrs = ((urls.protocol+urls.host).replace(/:/gi, '-').replace(/\./gi,'-'));
		    
		    self.proxyURL[websites[idx]] = vstrs[0]+'//'+wstrs+'.'+vstrs[1]+urls.path;
	    }
	    appHttp.use(function(req, res){
		    res.end('unknown website');
		});
	    
	    // 4.
	    // hook App on name-client
	    nmcln.bsrv.srv.on('request', appHttp);	
	    nmcln.bsrv.srv.on('upgrade', appWs);
	    
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
    var proto = urls.protocol || 'http:';
    var port  = urls.port || (proto === 'https:' ? 443 : 80);
    
    
    ///console.log('website URL:'+JSON.stringify(urls));
    
    return function(req, res){
		// cache proxy
        if (!self.proxyCache[website]) {
            // create proxy to target
            self.proxyCache[website] = new httppProxy.HttpProxy({
                changeOrigin: true,
                
                httpp: true,
                
                /*forward: {
                   httpp: false, 
                    
                     host: host,
                     port: port,
                    https: proto === 'https:'
                },*/
                               
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
        
		// proxy for redirection on same host, override location header
		// TBD...

        // overwrite href in text/html response
		// TBD...
    };
};

// proxy for websocket
Proxy.prototype.proxyWebsocket = function(website){ // like https://www.google.com
    var self  = this;
    var urls  = url.parse(website, true, true);
    var host  = urls.hostname;
    var proto = urls.protocol || 'ws:';
    var port  = urls.port || (proto === 'wss:' ? 443 : 80);
    
    
    ///console.log('website URL:'+JSON.stringify(urls));
    
    return function(req, socket, head){
		// cache proxy
        if (!self.proxyCache[website]) {
            // create proxy to target
            self.proxyCache[website] = new httppProxy.HttpProxy({
                changeOrigin: true,
                
                httpp: true,
                
                /*forward: {
                   httpp: false, 
                    
                     host: host,
                     port: port,
                    https: proto === 'wss:'
                },*/
   
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
        
		// proxy for redirection on same host, overwrite location header
		// TBD...
		
		// overwrite href in text/html response
		// TBD...
    };
};

// class methods

// simple test cass
/*
(function(websites){
    var prxy = new Proxy(websites, function(err, proxyURL){
        console.log('Website                            Proxy URL(please open it)');
        for (var k in proxyURL) {
            console.log(k+'        '+proxyURL[k]);
        }
    });
})(['http://www.w3school.com.cn']);
*/
