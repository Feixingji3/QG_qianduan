const http = require('http')
const fs = require('fs')
const path = require('path')

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html'
    }

    const ext = path.extname(filePath)
    let contentType = 'text/html'
    if (ext === '.css') contentType = 'text/css'
    if (ext === '.js') contentType = 'application/javascript'

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404)
            res.end('文件不存在')
        } else {
            res.writeHead(200, { 'Content-Type': contentType })
            res.end(content)
        }
    })
})

server.listen(3001, () => {
    console.log('服务器已启动，请访问 http://localhost:3001')
})