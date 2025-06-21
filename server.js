const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
app.use(cors());
app.use(express.json());

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'FFmpeg Video API is running!',
    timestamp: new Date().toISOString(),
    port: process.env.PORT || 10000
  });
});

// Test FFmpeg endpoint
app.get('/test-ffmpeg', async (req, res) => {
  try {
    const { stdout } = await execPromise('ffmpeg -version');
    res.json({ 
      success: true,
      ffmpeg: stdout.split('\n')[0]
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'FFmpeg not found',
      details: error.message
    });
  }
});

// Create video endpoint
app.post('/create-video', async (req, res) => {
  const { audioUrl, imageUrl, duration = 180 } = req.body;
  
  console.log('Received request:', { audioUrl, imageUrl, duration });
  
  if (!audioUrl || !imageUrl) {
    return res.status(400).json({ error: 'audioUrl and imageUrl are required' });
  }

  const uniqueId = Date.now();
  const audioPath = `/tmp/audio_${uniqueId}.mp3`;
  const imagePath = `/tmp/image_${uniqueId}.jpg`;
  const outputPath = `/tmp/output_${uniqueId}.mp4`;

  try {
    // Download audio
    console.log('Downloading audio...');
    const audioData = await axios.get(audioUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(audioPath, audioData.data);
    
    // Download image
    console.log('Downloading image...');
    const imageData = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(imagePath, imageData.data);

    // Create video using FFmpeg command line
    console.log('Creating video with FFmpeg...');
    const ffmpegCommand = `ffmpeg -loop 1 -i ${imagePath} -i ${audioPath} -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest -t ${duration} ${outputPath}`;
    
    await execPromise(ffmpegCommand);
    
    console.log('Video created, uploading to Cloudinary...');
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(outputPath, {
      resource_type: 'video',
      folder: 'linkedin-songs'
    });

    // Clean up temp files
    fs.unlinkSync(audioPath);
    fs.unlinkSync(imagePath);
    fs.unlinkSync(outputPath);
    
    res.json({
      success: true,
      videoUrl: result.secure_url,
      publicId: result.public_id
    });

  } catch (error) {
    console.error('Error:', error.message);
    
    // Clean up files on error
    [audioPath, imagePath, outputPath].forEach(file => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
    
    res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
