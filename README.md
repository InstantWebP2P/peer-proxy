#peer-proxy
===============

Proxy web service or website from peer.

### Features

* Support proxy to local/home http server
* Partial support proxy to remote website
* Support Websocket
* Secure end-to-end connections
* Generate proxy to 301/302 redirection automatically
* Generate proxy to href in text/html automatically

### Install
* npm install peer-proxy
* peer-proxy depend on iwebpp.io, please make sure iwebpp.io install correctly.
  https://github.com/InstantWebP2P/iwebpp.io

### Usage/API:

    1. create proxy-example.js
    var Proxy = require('peer-proxy');
    var prx = new Proxy(['http://w3schools.com/', 'http://www.google.com.hk/'], function(err, proxyURL){
        console.log('Website                            Proxy URL(please open it on browser)');
        for (var k in proxyURL) {
            console.log(k+'        '+proxyURL[k]);
        }
    });
    
    2. launch proxy server by node_modules/iwebpp.io/bin/win32/node.exe proxy-example.js in case Windows32 machine.
       console dump like below:
       Website                            Proxy URL(please open it)
       http://w3schools.com/        https://zfaef294477c5aa14s.fae725b2c0812dc6.vurl.iwebpp.com:51688//vtoken/eb04d54a2f9edd5d
       http://www.google.com.hk/        https://z7fd8e9e469ef6733s.fae725b2c0812dc6.vurl.iwebpp.com:51688//vtoken/eb04d54a2f9edd5d

### TODO:

* Overwrite text/html href using DOM instead of regex
* Proxy via STUN session

<br/>
### License

(The MIT License)

Copyright (c) 2012-2013 Tom Zhou

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
