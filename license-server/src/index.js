const express = require('express');
const app = express();
const port = 3000;

app.get('/license', (req, res) => {
    res.send('License Server đã sẵn sàng.');
});

// Quan trọng: Phải có app.listen để giữ container không bị thoát
app.listen(port, '0.0.0.0', () => {
  console.log(`License Server đang chạy tại http://localhost:${port}`);
});