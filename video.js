module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, key: clientKey } = req.query;
  const key = process.env.YOUTUBE_API_KEY || clientKey;
  if (!key) return res.status(400).json({ error: 'API key missing' });
  if (!id) return res.status(400).json({ error: 'Video ID required' });

  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${id}&key=${key}`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: d.error.message });
    if (!d.items?.length) return res.status(404).json({ error: 'Video not found' });
    
    const v = d.items[0];
    const views = parseInt(v.statistics.viewCount || 0);
    const likes = parseInt(v.statistics.likeCount || 0);
    const comments = parseInt(v.statistics.commentCount || 0);
    const daysAgo = Math.floor((new Date() - new Date(v.snippet.publishedAt)) / 86400000);
    const vph = daysAgo > 0 ? Math.round(views / (daysAgo * 24)) : views;
    const dur = v.contentDetails.duration;
    const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || [];
    const totalMins = (parseInt(match[1]||0)*60) + parseInt(match[2]||0);
    
    let score = 50;
    if (views > 1000000) score += 20; else if (views > 500000) score += 15; else if (views > 100000) score += 10; else if (views > 50000) score += 5;
    if (views > 0 && likes/views > 0.05) score += 15; else if (views > 0 && likes/views > 0.02) score += 8;
    if (daysAgo <= 3) score += 15; else if (daysAgo <= 7) score += 10; else if (daysAgo <= 14) score += 5;
    score = Math.min(99, score);
    
    return res.status(200).json({
      video: {
        id: v.id, title: v.snippet.title, description: v.snippet.description,
        channel: v.snippet.channelTitle, channelId: v.snippet.channelId,
        views, likes, comments, vph, daysAgo,
        likeRatio: views > 0 ? ((likes/views)*100).toFixed(2) : 0,
        commentRatio: views > 0 ? ((comments/views)*100).toFixed(2) : 0,
        duration: totalMins, durationRaw: dur,
        thumbnail: v.snippet.thumbnails?.maxres?.url || v.snippet.thumbnails?.high?.url || '',
        publishedAt: v.snippet.publishedAt, tags: v.snippet.tags || [],
        score, url: `https://www.youtube.com/watch?v=${v.id}`
      }
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
