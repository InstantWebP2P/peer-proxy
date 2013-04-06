#peer-proxy
===============

Proxy web service or website from peer.

### Features

* Support proxy to local/home http server, behind firewall/nat
* Partial support proxy to remote website, behind firewall/nat
* Support Websocket
* Secure end-to-end connections
* Token-based authentication for user's ip
* Support rewrite location header in 301/302 redirection response
* Support rewrite href in text/html response

### Install
* npm install peer-proxy
* peer-proxy depend on node-httpp, please install node-httpp correctly.
  https://github.com/InstantWebP2P/node-httpp

### Usage/API:

    1. create proxy-example.js
    var Proxy = require('peer-proxy');
    var prx = new Proxy(['http://w3schools.com/', 'http://example.com/'], function(err, proxyURL){
        console.log('Website                            Proxy URL(please open it on browser)');
        for (var k in proxyURL) {
            console.log(k+'        '+proxyURL[k]);
        }
    });
    
    2. launch proxy server by node_modules/iwebpp.io/bin/win32/node.exe proxy-example.js in case Windows32 machine.
       console dump like below:
       Website                            Proxy URL(please open it)
       http://w3schools.com/        https://zfaef294477c5aa14s.fae725b2c0812dc6.vurl.iwebpp.com:51688//vtoken/eb04d54a2f9edd5d
       http://example.com/        https://z7fd8e9e469ef6733s.fae725b2c0812dc6.vurl.iwebpp.com:51688//vtoken/eb04d54a2f9edd5d
       
    3. use peer-proxy binary on Linux, like  ./bin/peer-proxy -t http://example.com
       Website                            Proxy URL(please open it on browser)
       http://example.com        https://zc5a93bdde908a92cs.d4ddf763050ab93e.vurl.iwebpp.com:51688//vtoken/8bb975c3385f47f3

### TODO:

* Rewrite href in text/html using DOM instead of regex
* Enable proxy via STUN session

<br/>
### License

(The MIT License)

Copyright (c) 2012-2013 Tom Zhou

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
