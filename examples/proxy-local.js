var Proxy = require('../index');
var http = require('http');

// create local http server
var server = http.createServer(function(req, res){
    res.writeHeader(200);
    res.write('Hello, this is local http server.');
    res.end();
});

server.listen(3000);
console.log('Local http server listening on port 3000');

var proxy = new Proxy(['http://192.188.1.168:8081/'], function(err, proxyURL){
        console.log('Website                            Proxy URL(please open it on browser)');
        for (var k in proxyURL) {
            console.log(k+'        '+proxyURL[k]);
        }
    });
