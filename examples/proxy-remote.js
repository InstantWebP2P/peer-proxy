var Proxy = require('../index');

var srv = new Proxy(['http://www.google.com.hk/', 'http://www.w3school.com.cn/'], function(err, proxyURL){
        console.log('Website                            Proxy URL(please open it on browser)');
        for (var k in proxyURL) {
            console.log(k+'        '+proxyURL[k]);
        }
    });
    
