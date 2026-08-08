module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { id, username } = req.query;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(400).json({ error: 'API key not configured' });
  try {
    let chUrl = id
      ? `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${id}&key=${key}`
      : `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&forHandle=${encodeURIComponent(username||'')}&key=${key}`;
    const cr = await fetch(chUrl); const cd = await cr.json();
    if (cd.error) return res.status(400).json({ error: cd.error.message });
    if (!cd.items?.length) return res.status(404).json({ error: 'Channel not found. Try @username format' });
    const ch = cd.items[0]; const channelId = ch.id;
    const vr = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=viewCount&maxResults=20&key=${key}`);
    const vd = await vr.json();
    const videoIds = (vd.items||[]).map(i=>i.id.videoId).filter(Boolean).join(',');
    let topVideos = [];
    if (videoIds) {
      const vsr = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${key}`);
      const vsd = await vsr.json();
      topVideos = (vsd.items||[]).map(v => {
        const dur=v.contentDetails.duration;
        const m=dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)||[];
        const mins=(parseInt(m[1]||0)*60)+parseInt(m[2]||0);
        const views=parseInt(v.statistics.viewCount||0), likes=parseInt(v.statistics.likeCount||0);
        const daysAgo=Math.floor((new Date()-new Date(v.snippet.publishedAt))/86400000);
        return { id:v.id, title:v.snippet.title, views, likes, daysAgo, mins,
          likeRatio:views>0?((likes/views)*100).toFixed(2):0,
          thumbnail:v.snippet.thumbnails?.medium?.url||'',
          tags:v.snippet.tags||[], publishedAt:v.snippet.publishedAt,
          url:`https://www.youtube.com/watch?v=${v.id}` };
      }).filter(v=>v.mins>=5).sort((a,b)=>b.views-a.views);
    }
    const subs=parseInt(ch.statistics.subscriberCount||0);
    const totalViews=parseInt(ch.statistics.viewCount||0);
    const videoCount=parseInt(ch.statistics.videoCount||0);
    // Upload pattern
    const dates = topVideos.map(v=>new Date(v.publishedAt));
    const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dayCounts = {};
    dates.forEach(d=>{ const day=dayNames[d.getDay()]; dayCounts[day]=(dayCounts[day]||0)+1; });
    const bestDay = Object.entries(dayCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'Unknown';
    return res.status(200).json({
      channel:{ id:channelId, name:ch.snippet.title, description:ch.snippet.description,
        country:ch.snippet.country||'Unknown', thumbnail:ch.snippet.thumbnails?.medium?.url||'',
        subs, totalViews, videoCount, avgViewsPerVideo:videoCount>0?Math.round(totalViews/videoCount):0,
        keywords:ch.brandingSettings?.channel?.keywords||'',
        createdAt:ch.snippet.publishedAt, bestUploadDay:bestDay,
        url:`https://www.youtube.com/channel/${channelId}` },
      topVideos
    });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}
