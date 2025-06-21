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

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'FFmpeg Video API is running!',
    timestamp: new Date().toISOString()
  });
});

// Create video endpoint - FIXED VERSION
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
    // Download files
    console.log('Downloading audio...');
    const audioData = await axios.get(audioUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(audioPath, audioData.data);
    
    console.log('Downloading image...');
    const imageData = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(imagePath, imageData.data);

    // Convert image to proper JPEG if needed and resize
    console.log('Preparing image...');
    await execPromise(`ffmpeg -i ${imagePath} -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -q:v 2 ${imagePath}.converted.jpg -y`);
    
    // Use the converted image
    const finalImagePath = `${imagePath}.converted.jpg`;

    // Create video with more efficient settings
    console.log('Creating video with optimized settings...');
    const ffmpegCommand = `ffmpeg -loop 1 -framerate 1 -i ${finalImagePath} -i ${audioPath} -c:v libx264 -preset veryfast -crf 30 -r 1 -c:a copy -shortest -movflags +faststart ${outputPath} -y`;
    
    console.log('Running:', ffmpegCommand);
    
    const { stdout, stderr } = await execPromise(ffmpegCommand, {
      timeout: 120000 // 2 minute timeout
    });
    
    console.log('FFmpeg output:', stderr);
    
    // Check if file was created
    if (!fs.existsSync(outputPath)) {
      throw new Error('Video file was not created');
    }
    
    const stats = fs.statSync(outputPath);
    console.log('Video created, size:', stats.size);

    console.log('Uploading to Cloudinary...');
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(outputPath, {
      resource_type: 'video',
      folder: 'linkedin-songs',
      timeout: 120000
    });

    // Clean up temp files
    [audioPath, imagePath, finalImagePath, outputPath].forEach(file => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
    
    console.log('Success! Video URL:', result.secure_url);
    
    res.json({
      success: true,
      videoUrl: result.secure_url,
      publicId: result.public_id
    });

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    // Clean up files on error
    [audioPath, imagePath, `${imagePath}.converted.jpg`, outputPath].forEach(file => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
    
    res.status(500).json({ 
      error: error.message,
      details: error.stderr || error.stack
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
