const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.use(express.json());

// PROXY: Forward video stream requests to MediaMTX
app.use('/video-stream', createProxyMiddleware({ 
    target: 'http://mediamtx:8889', 
    changeOrigin: true,
    pathRewrite: { '^/video-stream': '' }
}));

// CONTROL: Handle rover movement commands
app.post('/api/control/:direction', (req, res) => {
    const direction = req.params.direction;
    console.log(`Rover command: ${direction}`);
    
    // TODO: Send command to rover hardware/controller
    // For now, just log it
    
    res.json({ status: 'ok', command: direction });
});

app.listen(3000, () => console.log('Server at :3000'));