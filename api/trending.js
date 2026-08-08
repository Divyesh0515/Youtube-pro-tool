module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { category = '' } = req.query;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(400).json({ error: 'API key not configured in Vercel' });
  try {
    const catParam = category ? `&videoCategoryId=${category}` : '';
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&chart=mostPopular&regionCode=US&maxResults=25&videoDuration=medium&hl=en${catParam}&key=${key}`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: d.error.message });
    const videos = (d.items || []).map(v => {
      const dur = v.contentDetails.duration;
      const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || [];
      const mins = (parseInt(m[1]||0)*60) + parseInt(m[2]||0);
      if (mins < 5) return null;
      const views = parseInt(v.statistics.viewCount||0);
      const likes = parseInt(v.statistics.likeCount||0);
      const daysAgo = Math.floor((new Date()-new Date(v.snippet.publishedAt))/86400000);
      return {
        id: v.id, title: v.snippet.title, channel: v.snippet.channelTitle,
        channelId: v.snippet.channelId, views, likes,
        comments: parseInt(v.statistics.commentCount||0),
        mins, daysAgo, likeRatio: views>0?((likes/views)*100).toFixed(1):0,
        thumbnail: v.snippet.thumbnails?.medium?.url||'',
        publishedAt: v.snippet.publishedAt,
        tags: v.snippet.tags||[],
        url: `https://www.youtube.com/watch?v=${v.id}`
      };
    }).filter(Boolean);
    return res.status(200).json({ videos });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}
