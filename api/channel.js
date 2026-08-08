module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, username, key: clientKey } = req.query;
  const key = process.env.YOUTUBE_API_KEY || clientKey;
  if (!key) return res.status(400).json({ error: 'API key missing' });

  try {
    let channelUrl;
    if (id) {
      channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${id}&key=${key}`;
    } else if (username) {
      channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&forHandle=${encodeURIComponent(username)}&key=${key}`;
    } else {
      return res.status(400).json({ error: 'Channel ID or username required' });
    }
    
    const cr = await fetch(channelUrl);
    const cd = await cr.json();
    if (cd.error) return res.status(400).json({ error: cd.error.message });
    if (!cd.items?.length) return res.status(404).json({ error: 'Channel not found. Try with @ symbol like @MrBeast' });
    
    const ch = cd.items[0];
    const channelId = ch.id;
    
    const videosUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=viewCount&maxResults=20&key=${key}`;
    const vr = await fetch(videosUrl);
    const vd = await vr.json();
    const videoIds = (vd.items || []).map(i => i.id.videoId).filter(Boolean).join(',');
    
    let topVideos = [];
    if (videoIds) {
      const vsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${key}`;
      const vsr = await fetch(vsUrl);
      const vsd = await vsr.json();
      topVideos = (vsd.items || []).map(v => ({
        id: v.id,
        title: v.snippet.title,
        views: parseInt(v.statistics.viewCount || 0),
        likes: parseInt(v.statistics.likeCount || 0),
        daysAgo: Math.floor((new Date() - new Date(v.snippet.publishedAt)) / 86400000),
        likeRatio: parseInt(v.statistics.viewCount||0) > 0 ? ((parseInt(v.statistics.likeCount||0)/parseInt(v.statistics.viewCount||0))*100).toFixed(2) : 0,
        duration: v.contentDetails.duration,
        thumbnail: v.snippet.thumbnails?.medium?.url || '',
        tags: v.snippet.tags || [],
        publishedAt: v.snippet.publishedAt,
        url: `https://www.youtube.com/watch?v=${v.id}`
      })).sort((a,b) => b.views - a.views);
    }
    
    const subs = parseInt(ch.statistics.subscriberCount || 0);
    const totalViews = parseInt(ch.statistics.viewCount || 0);
    const videoCount = parseInt(ch.statistics.videoCount || 0);
    
    return res.status(200).json({
      channel: {
        id: channelId, name: ch.snippet.title, description: ch.snippet.description,
        country: ch.snippet.country || 'Unknown', thumbnail: ch.snippet.thumbnails?.medium?.url || '',
        subs, totalViews, videoCount, avgViewsPerVideo: videoCount > 0 ? Math.round(totalViews/videoCount) : 0,
        keywords: ch.brandingSettings?.channel?.keywords || '',
        createdAt: ch.snippet.publishedAt, url: `https://www.youtube.com/channel/${channelId}`
      },
      topVideos
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
