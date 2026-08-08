module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { category = '', key: clientKey } = req.query;
  const key = process.env.YOUTUBE_API_KEY || clientKey;
  
  if (!key) {
    return res.status(400).json({ error: 'YouTube API key not configured. Add YOUTUBE_API_KEY in Vercel Environment Variables.' });
  }

  try {
    const catParam = category ? `&videoCategoryId=${category}` : '';
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&chart=mostPopular&regionCode=US&maxResults=20&hl=en${catParam}&key=${key}`;
    
    const r = await fetch(url);
    const d = await r.json();
    
    if (d.error) {
      return res.status(400).json({ error: d.error.message });
    }
    
    const videos = (d.items || []).map(v => ({
      id: v.id,
      title: v.snippet.title,
      channel: v.snippet.channelTitle,
      channelId: v.snippet.channelId,
      views: parseInt(v.statistics.viewCount || 0),
      likes: parseInt(v.statistics.likeCount || 0),
      comments: parseInt(v.statistics.commentCount || 0),
      duration: v.contentDetails.duration,
      thumbnail: v.snippet.thumbnails?.medium?.url || '',
      publishedAt: v.snippet.publishedAt,
      tags: v.snippet.tags || [],
      categoryId: v.snippet.categoryId,
      url: `https://www.youtube.com/watch?v=${v.id}`
    }));
    
    return res.status(200).json({ videos, total: videos.length });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
