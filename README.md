peer-proxy
===============

Expose Web Service from Peer

### Features

* Expose local http server, behind firewall/nat
* Expose remote website, behind firewall/nat
* Proxy Websocket
* Forward proxy tunneling
* Secure end-to-end connections
* Token-based authentication based on user's IP address
* Rewrite location header in 3XX redirection response
* Rewrite href in 2XX text/html response
* Run over STUN session with iwebpp.io-stun-proxy
* Proxy web server dynamically on fly
* Http basic-auth support

### Install
* npm install peer-proxy, or git clone https://github.com/InstantWebP2P/peer-proxy.git && cd peer-proxy && npm install
* peer-proxy depend on node-httpp, please npm install httpp-binary.if the binary didn't work, just build it from source:
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
    
    2. launch proxy server by node-httpp-binary-directory/node.exe proxy-example.js in case Windows machine.
       console dump like below:
       Website                            Proxy URL(please open it)
       http://w3schools.com/        https://zfaef294477c5aa14s.fae725b2c0812dc6.vurl.iwebpp.com:51688//vtoken/eb04d54a2f9edd5d
       http://example.com/        https://z7fd8e9e469ef6733s.fae725b2c0812dc6.vurl.iwebpp.com:51688//vtoken/eb04d54a2f9edd5d
       
    3. use peer-proxy binary on Linux, like  ./bin/peer-proxy -t http://example.com
       Website                            Proxy URL(please open it on browser)
       http://example.com        https://zc5a93bdde908a92cs.d4ddf763050ab93e.vurl.iwebpp.com:51688//vtoken/8bb975c3385f47f3

    4. in case the local http server run on localhost with port 3000, do ./bin/peer-proxy -t http://localhost:3000
       if it's https server on port 3000, do ./bin/peer-proxy -t https://localhost:3000
       
    5. run over STUN with iwebpp.io-stun-proxy, just embed 'vlocal.' as sub-domain in origin vURL, 
       like https://zc5a93bdde908a92cs.d4ddf763050ab93e.vurl.vlocal.iwebpp.com:51688//vtoken/8bb975c3385f47f3

### TODO:

* Rewrite href in text/html using DOM instead of regex


### Support us

* 远程工作云办公联盟 QQ 群号: 463651269


<br/>
### License

(The MIT License)

Copyright (c) 2012-2017 Tom Zhou(iwebpp@gmail.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
