const express = require('express');
const ssr = require('./ssr');

const app = express();

app.use(express.static('public'));

app.get('/', async (req, res, next) => {
  const { html, ttRenderMs } = await ssr(`${req.protocol}://${req.get('host')}/index.html`);

  // Add Server-Timing! See https://w3c.github.io/server-timing/
  res.set('Server-Timing', `Prerender;dur=${ttRenderMs};desc=Headless render time (ms)"`);

  return res.status(200).send(html); // Server prerendered page as a response
});

app.get('/posts', (req, res) => {
  res.json([
    {
      title: 'Post #1',
      summary: 'This is summary for first post',
      content: 'This is content of first post',
    },
    {
      title: 'Post #2',
      summary: 'This is summary for second post',
      content: 'This is content of second post',
    },
    {
      title: 'Post #3',
      summary: 'This is summary for third post',
      content: 'This is content of third post',
    },
  ])
});

app.listen(8080, () => console.log('Server started. Press Ctrl+C to quit'));
