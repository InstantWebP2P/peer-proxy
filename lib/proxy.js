// Copyright (c) 2013 Tom Zhou<zs68j2ee@gmail.com>

var WEBPP = require('iwebpp.io'),
    SEP = WEBPP.SEP,
    httppProxy = require('httpp-proxy'),
    express = require('express'),
    url = require('url');


// proxy apps
var proxyCache = {};

var proxyHttp = function(website, secure){ // web site URL like www.google.com or google.com
    var urls  = url.parse(website, true, true);
    var host  = urls.hostname;
    var port  = urls.port || (secure ? 443 : 80);
    var https = secure || false;
    var vkey  = host+port+secure;
    
    console.log('website URL:'+JSON.stringify(urls));
    
    return function(req, res){
		// cache proxy
        if (!proxyCache[vkey]) {
            // create proxy to target
            proxyCache[vkey] = new httppProxy.HttpProxy({
                httpp: true,
                
                forward: {
                   httpp: false, 
                    
                     host: host,
                     port: port,
                    https: https
                },
                               
                target: {
                    httpp: false, 
                    
                     host: host,
                     port: port,
                    https: https
                }
            });
        }
        
        // proxy target
        proxyCache[vkey].proxyRequest(req, res);
    };
};

var proxyWebsocket = function(website, secure){ // like www.google.com or google.com
    var urls  = url.parse(website, true, true);
    var host  = urls.hostname;
    var port  = urls.port || (secure ? 443 : 80);
    var https = secure || false;
    var vkey  = host+port+secure;
    
    
    return function(req, socket, head){
		// cache proxy
        if (!proxyCache[vkey]) {
            // create proxy to target
            proxyCache[vkey] = new httppProxy.HttpProxy({
                httpp: true,
                
                forward: {
                   httpp: false, 
                    
                     host: host,
                     port: port,
                    https: https
                },
   
                target: {
                    httpp: false, 
                    
                     host: host,
                     port: port,
                    https: https
                }
            });
        }
        
        // proxy target
        proxyCache[vkey].proxyWebSocketRequest(req, socket, head);
    };
};

// proxy entity
// a proxy will contain one iwebpp.io name-client
var Proxy = function(websites, fn, usrkey, domain){ // array like ['sohu.com', 'google.com']
    if (!(this instanceof Proxy)) return new Proxy(websites, fn, usrkey, domain);
    
    if (!Array.isArray(websites)) websites = [websites];
    
    // 1.
    // create name client
    var nmcln = new WEBPP({
        usrinfo: {domain: domain || '51dese.com', usrkey: usrkey || 'dese'}
    });
	    
	nmcln.on('ready', function(){
	    console.log('name-client ready on vpath:'+nmcln.vpath);
	
	    // 2.
	    // create http proxy App
	    var appHttp = express();
	    for (var idx = 0; idx < websites.length; idx ++) {
	        var urls  = url.parse('//'+websites[idx], true, true);
	        
	        console.log('website:'+websites[idx]);
		    appHttp.use('/'+urls.host, proxyHttp('//'+websites[idx]));
		    appHttp.use('/'+urls.host, proxyHttp('//'+websites[idx], true));
	    }
	    appHttp.use(function(req, res){
		    res.end('unknown website');
		});
		    
	    // hook appHttp on business server and mount on vPath
	    var shellHttp = express();
	    shellHttp.use(nmcln.vpath, appHttp);
	    nmcln.bsrv.srv.on('request', shellHttp);
	    
	    // 3.
	    // websocket proxy App
	    var appWs = express();
	    for (var idx = 0; idx < websites.length; idx ++) {
		    appWs.use(websites[idx], proxyWebsocket('//'+websites[idx]));
		    appWs.use(websites[idx], proxyWebsocket('//'+websites[idx], true));
	    }
		    
	    // hook appWs on business server and mount on vPath
	    var shellWs = express();
	    shellWs.use(nmcln.vpath, appWs);
	    nmcln.bsrv.srv.on('upgrade', shellWs);
	        
	    console.log('please access URL:'+nmcln.vurl);
	    fn(null, nmcln.vurl);
	});
};

(function(website){
    var prxy = new Proxy(website, function(err, vurl){
        console.log(vurl+'/'+website);
    });
})('sohu.com');
