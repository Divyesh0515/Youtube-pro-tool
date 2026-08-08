module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q, key: clientKey } = req.query;
  const key = process.env.YOUTUBE_API_KEY || clientKey;
  if (!key) return res.status(400).json({ error: 'API key missing' });
  if (!q) return res.status(400).json({ error: 'Query required' });

  try {
    const after = new Date();
    after.setDate(after.getDate() - 90);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&regionCode=US&relevanceLanguage=en&publishedAfter=${after.toISOString()}&maxResults=25&order=viewCount&key=${key}`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: d.error.message });
    
    const count = d.pageInfo?.totalResults || 0;
    const items = d.items || [];
    const ids = items.map(i=>i.id.videoId).filter(Boolean).join(',');
    
    let avgViews=0, topVideos=[];
    if (ids) {
      const sUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${ids}&key=${key}`;
      const sr = await fetch(sUrl);
      const sd = await sr.json();
      topVideos = (sd.items||[]).map(v=>({
        id: v.id, title: v.snippet.title, channel: v.snippet.channelTitle,
        views: parseInt(v.statistics.viewCount||0), likes: parseInt(v.statistics.likeCount||0),
        thumbnail: v.snippet.thumbnails?.medium?.url||'',
        publishedAt: v.snippet.publishedAt, url: `https://www.youtube.com/watch?v=${v.id}`
      })).sort((a,b)=>b.views-a.views);
      if (topVideos.length) avgViews = Math.round(topVideos.reduce((s,v)=>s+v.views,0)/topVideos.length);
    }
    
    const compLevel = count < 50 ? 'VERY LOW' : count < 200 ? 'LOW' : count < 500 ? 'MEDIUM' : count < 1000 ? 'HIGH' : 'VERY HIGH';
    const opportunity = count < 100 && avgViews > 10000 ? 'EXCELLENT' : count < 300 && avgViews > 5000 ? 'GOOD' : count < 500 ? 'FAIR' : 'LOW';
    
    return res.status(200).json({
      query: q, totalResults: count, compLevel, opportunity, avgViews,
      topVideos: topVideos.slice(0,10),
      recommendation: opportunity === 'EXCELLENT' ?
        `🔥 MAKE THIS VIDEO NOW! Only ${count} videos exist but getting ${avgViews.toLocaleString()} avg views. Low competition, high demand!` :
        opportunity === 'GOOD' ?
        `✅ Good opportunity! ${count} videos with ${avgViews.toLocaleString()} avg views. Make a better version.` :
        `⚠️ Competition exists. ${count} videos with ${avgViews.toLocaleString()} avg views. Need unique angle.`
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
