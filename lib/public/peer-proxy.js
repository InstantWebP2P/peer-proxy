$(document).ready(function(){
    var debug = 0;
    // regex helpers
    var REGEX_URL  = new RegExp("(https?)://[a-z0-9-]+(\.[a-z0-9-]+)+(/?)", "gi");
    var vurleregex = /([0-9]|[a-f]){32}/gi;
    var vhostregex = /([0-9]|[a-f]){32}\.vurl\./gi;
    var vpathregex = /\/vurl\/([0-9]|[a-f]){32}/gi;
    var vurlsregex = /(([0-9]|[a-f]){32}\.vurl\.)|(([0-9]|[a-f]){32}\.vurl\.)/;
    
    var hrefs = [];
    
    if (debug) console.log("link size:"+document.links.length);
    // get all un-proxied hrefs
    for (var idx in document.links) {
        var href = document.links[idx].href;
        if (href && href.match(REGEX_URL) && !href.match(vurlsregex)) {
            hrefs.push(href);
        }
        if (debug) console.log("href:"+href);
    }
    if (debug) console.log("unproxied href size:"+hrefs.length);
    
    // ask ajax to proxy hrefs every 20 link
    for (var idx=0; idx < hrefs.length; idx+=20) {
        var qsstr  = "/vadmin/3/?url=";
        
        // build qs string
        for (var i=idx; (i<idx+20)&&(i<hrefs.length); i++) {
            qsstr += hrefs[i]+",";    
        }
        
        $.post(location.protocol+'//'+location.host+qsstr,
        function(data, status){
            if (debug) console.log("ajax status:"+status+",data:"+JSON.stringify(data));
            
            if (status == 'success') {
                for (var url in data) {
		            // rewrite href
			        if (debug) console.log(url+" -> "+data[url]);
			        $("[href="+"'"+url+"'"+"]").attr("href", data[url]);
		        }
            }
        });
    }
});