// AssemblyAI transcription proxy
// Handles three actions: upload, submit, poll

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Action, X-Transcript-Id');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = req.headers['x-action'] || 'upload';
  const AAI_KEY = process.env.ASSEMBLYAI_KEY;

  try {
    // ACTION: upload — receives raw audio bytes, uploads to AssemblyAI, returns upload_url
    if (action === 'upload') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);

      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'authorization': AAI_KEY,
          'content-type': req.headers['content-type'] || 'application/octet-stream',
        },
        body,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        return res.status(uploadRes.status).json({ error: err });
      }

      const { upload_url } = await uploadRes.json();
      return res.status(200).json({ upload_url });
    }

    // ACTION: submit — submits the upload_url for transcription, returns transcript_id
    if (action === 'submit') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const { upload_url } = JSON.parse(Buffer.concat(chunks).toString());

      const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'authorization': AAI_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ audio_url: upload_url, speaker_labels: false }),
      });

      if (!submitRes.ok) {
        const err = await submitRes.text();
        return res.status(submitRes.status).json({ error: err });
      }

      const { id } = await submitRes.json();
      return res.status(200).json({ transcript_id: id });
    }

    // ACTION: poll — checks status of a transcript, returns status + text when done
    if (action === 'poll') {
      const transcriptId = req.headers['x-transcript-id'];
      if (!transcriptId) return res.status(400).json({ error: 'Missing x-transcript-id header' });

      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { 'authorization': AAI_KEY },
      });

      if (!pollRes.ok) {
        const err = await pollRes.text();
        return res.status(pollRes.status).json({ error: err });
      }

      const data = await pollRes.json();
      return res.status(200).json({
        status: data.status,
        text: data.text || null,
        error: data.error || null,
      });
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });

  } catch (error) {
    console.error('Transcription proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
