const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const root=process.cwd();
http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.md':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(data);});
}).listen(8080,'127.0.0.1',()=>console.log('http://127.0.0.1:8080'));
