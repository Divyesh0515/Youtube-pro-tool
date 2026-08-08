module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q, days = 30, key: clientKey } = req.query;
  const key = process.env.YOUTUBE_API_KEY || clientKey;
  
  if (!key) return res.status(400).json({ error: 'API key missing' });
  if (!q) return res.status(400).json({ error: 'Query required' });

  try {
    const after = new Date();
    after.setDate(after.getDate() - parseInt(days));
    
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&regionCode=US&relevanceLanguage=en&publishedAfter=${after.toISOString()}&maxResults=25&order=viewCount&key=${key}`;
    const sr = await fetch(searchUrl);
    const sd = await sr.json();
    
    if (sd.error) return res.status(400).json({ error: sd.error.message });
    
    const ids = (sd.items || []).map(i => i.id.videoId).filter(Boolean).join(',');
    if (!ids) return res.status(200).json({ videos: [], stats: { totalVideos: 0, avgViews: 0, avgVph: 0, totalViews: 0, competition: 0, compLevel: 'LOW', topChannel: '', topViews: 0 } });
    
    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${ids}&key=${key}`;
    const str = await fetch(statsUrl);
    const std = await str.json();
    
    if (std.error) return res.status(400).json({ error: std.error.message });
    
    const videos = (std.items || []).map(v => {
      const views = parseInt(v.statistics.viewCount || 0);
      const likes = parseInt(v.statistics.likeCount || 0);
      const comments = parseInt(v.statistics.commentCount || 0);
      const daysAgo = Math.floor((new Date() - new Date(v.snippet.publishedAt)) / 86400000);
      const vph = daysAgo > 0 ? Math.round(views / (daysAgo * 24)) : views;
      return {
        id: v.id,
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        channelId: v.snippet.channelId,
        views, likes, comments, vph, daysAgo,
        likeRatio: views > 0 ? ((likes/views)*100).toFixed(2) : 0,
        duration: v.contentDetails.duration,
        thumbnail: v.snippet.thumbnails?.medium?.url || '',
        publishedAt: v.snippet.publishedAt,
        tags: v.snippet.tags || [],
        url: `https://www.youtube.com/watch?v=${v.id}`
      };
    }).sort((a,b) => b.views - a.views);
    
    const totalViews = videos.reduce((s,v) => s+v.views, 0);
    const avgViews = videos.length ? Math.round(totalViews / videos.length) : 0;
    const avgVph = videos.length ? Math.round(videos.reduce((s,v) => s+v.vph, 0) / videos.length) : 0;
    const compLevel = videos.length < 5 ? 'VERY LOW' : videos.length < 10 ? 'LOW' : videos.length < 20 ? 'MEDIUM' : 'HIGH';
    
    return res.status(200).json({
      videos,
      stats: { totalVideos: videos.length, avgViews, avgVph, totalViews, competition: videos.length, compLevel, topChannel: videos[0]?.channel || '', topViews: videos[0]?.views || 0 }
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
