// Copyright (c) 2013 Tom Zhou<zs68j2ee@gmail.com>

var WEBPP = require('iwebpp.io'),
    SEP = WEBPP.SEP,
    httppProxy = require('httpp-proxy'),
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
	    for (var idx = 0; idx < websites.length; idx ++) {
	        var urls  = url.parse(websites[idx], true, true);
	        var host  = urls.hostname;
	        var proto = urls.protocol || 'http:';
	        var port  = urls.port || ((proto === 'wss:' || proto === 'https:')? 443 : 80);
	        var path  = urls.path;
	        
	        // vURL string format
  		    var vstrs = nmcln.vurl.split('//');
		    var wstrs = (proto+host).replace(/:/gi, '-').replace(/\./gi,'-');
		    var vurle = wstrs+'.';

	        ///console.log('website:'+websites[idx]);
	        
	        // create proxy to target
            self.proxyCache[vurle] = new httppProxy.HttpProxy({
                changeOrigin: true,
                enable: {xforward: true},
                
                httpp: true,
                
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
	        
		    
		    // vhost-based vURL
		    self.proxyURL[websites[idx]] = vstrs[0]+'//'+wstrs+'.'+vstrs[1]+urls.path;
	    }
	    
	    // 3.
	    // creat http proxy App
	    
	    // website vhost regex, like http(s)-www-sohu-com.vurl.iwebpp.com
	    var vurleregex = /(http-|https-)([0-9]|[a-z]|-)+\./i;
	    
	    var appHttp = function(req, res){
	        var vstrs, vurle;
	        
	        if (vstrs = req.headers.host.match(vurleregex)) {
	            vurle = vstrs[0];
	            
	            // proxy target
                if (self.proxyCache[vurle]) {
                    self.proxyCache[vurle].proxyRequest(req, res);
                } else {
                    // unknown vURL
		            res.writeHead(400);
                    res.end('unknown vURL:'+JSON.stringify(req.headers));
                    return;
                }
	        } else {
	            // invalid vURL
	            res.writeHead(400);
                res.end('invalid vURL:'+JSON.stringify(req.headers));
                return;
	        }
	    };
	    
	    // 5.
	    // websocket proxy App
	    var appWs = function(req, socket, head){
	        var vstrs, vurle;
	        
	        if (vstrs = req.headers.host.match(vurleregex)) {
	            vurle = vstrs[0];
	            
	            // proxy target
                if (self.proxyCache[vurle]) {
                    self.proxyCache[vurle].proxyWebSocketRequest(req, socket, head);
                } else {
                    // unknown vURL
		            res.writeHead(400);
                    res.end('unknown vURL:'+JSON.stringify(req.headers));
                    return;
                }
	        } else {
	            // invalid vURL
	            res.writeHead(400);
                res.end('invalid vURL:'+JSON.stringify(req.headers));
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
})(['http://www.w3school.com.cn', 'http://v.youku.com/v_show/id_XNTMzMjg4Nzky.html']);
*/
