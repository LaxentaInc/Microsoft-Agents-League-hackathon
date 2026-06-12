#![allow(clippy::needless_range_loop)]
#![allow(clippy::same_item_push)]
// real-time audio frequency forwarder using wasapi loopback capture
// captures system audio output (what you hear), runs fft, forwards 128 frequency bands
// to all active interactive wallpaper webviews via colorwallAudioListener()
//
// this is the windows equivalent of pulseaudio's monitor source in linux
// uses AUDCLNT_STREAMFLAGS_LOOPBACK to tap into the render endpoint
//
// NOTE on the smoothing/blending pipeline:
// raw fft output is way too jittery for desktop wallpaper animations — frequency
// bins flicker violently frame-to-frame which looks terrible on widgets and visualizers
// that run 24/7 on someone's desktop. instead we blend real frequency data (40%) with
// bass-energy-driven interpolated noise (60%) and smooth the result. this produces
// visually "alive" and punchy reactivity that looks great in wallpapers and widgets
// even during quiet audio passages. the relative band proportions are still accurate
// (bass-heavy music lights up the low end more), but the absolute values should be
// treated as "visual energy" rather than precise frequency measurements. this is
// intentional — a wallpaper engine prioritizes aesthetics over scientific accuracy.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use rustfft::{FftPlanner, num_complex::Complex};
use tauri::{AppHandle, Manager};

use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::*;

lazy_static::lazy_static! {
    static ref AUDIO_FORWARDER_ACTIVE: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
}

const FFT_SIZE: usize = 2048;
const OUTPUT_BANDS: usize = 128;

pub fn start_audio_forwarder(app: AppHandle) {
    if AUDIO_FORWARDER_ACTIVE.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return;
    }

    std::thread::spawn(move || {
        println!("[interactive_audio] audio frequency forwarder starting...");
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "audio frequency forwarder starting");

        match run_audio_capture(&app) {
            Ok(_) => {
                println!("[interactive_audio] audio forwarder stopped normally");
                crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "audio forwarder stopped normally");
            }
            Err(e) => {
                println!("[interactive_audio] audio forwarder error: {}", e);
                crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", &format!("audio forwarder error: {}", e));
            }
        }

        AUDIO_FORWARDER_ACTIVE.store(false, Ordering::Relaxed);
        println!("[interactive_audio] audio forwarder stopped");
    });
}

fn run_audio_capture(app: &AppHandle) -> Result<(), String> {
    unsafe {
        // initialize com for this thread
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        // get default audio output device (render endpoint)
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| format!("failed to create device enumerator: {}", e))?;

        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|e| format!("failed to get default audio endpoint: {}", e))?;

        println!("[interactive_audio] got default render endpoint");
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "got default render endpoint");

        // activate audio client on the render device
        let audio_client: IAudioClient = device
            .Activate::<IAudioClient>(CLSCTX_ALL, None)
            .map_err(|e| format!("failed to activate audio client: {}", e))?;

        // get the mix format (what the device is currently using)
        let mix_format_ptr = audio_client
            .GetMixFormat()
            .map_err(|e| format!("failed to get mix format: {}", e))?;

        let mix_format = &*mix_format_ptr;
        let sample_rate = mix_format.nSamplesPerSec;
        let channels = mix_format.nChannels as usize;
        let bits_per_sample = mix_format.wBitsPerSample;

        println!(
            "[interactive_audio] format: {}Hz, {} channels, {} bits",
            sample_rate, channels, bits_per_sample
        );

        // initialize audio client in loopback mode
        // AUDCLNT_STREAMFLAGS_LOOPBACK captures the audio being rendered to the speakers
        let buffer_duration: i64 = 2_000_000; // 200ms in 100-nanosecond units
        let stream_flags = AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_NOPERSIST;
        audio_client
            .Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                stream_flags,
                buffer_duration,
                0,
                mix_format_ptr,
                None,
            )
            .map_err(|e| format!("failed to initialize loopback capture: {}", e))?;

        // get the capture client interface
        let capture_client: IAudioCaptureClient = audio_client
            .GetService()
            .map_err(|e| format!("failed to get capture client: {}", e))?;

        // start capturing
        audio_client
            .Start()
            .map_err(|e| format!("failed to start capture: {}", e))?;

        println!("[interactive_audio] wasapi loopback capture started");

        // fft setup
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);
        let mut fft_buffer: Vec<Complex<f32>> = vec![Complex::new(0.0, 0.0); FFT_SIZE];
        let mut sample_buffer: Vec<f32> = Vec::with_capacity(FFT_SIZE * 2);

        // output bands (smoothed)
        let mut output_bands = vec![0.0f32; OUTPUT_BANDS];
        let mut smoothed_bands = vec![0.0f32; OUTPUT_BANDS];

        // fake noise state for energetic reactivity!!!!!!!
        let mut target_fake_bands = vec![0.0f32; OUTPUT_BANDS];
        let mut fake_bands = vec![0.0f32; OUTPUT_BANDS];

        // hann window (precomputed for spectral leakage reduction)
        let hann_window: Vec<f32> = (0..FFT_SIZE)
            .map(|i| {
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / FFT_SIZE as f32).cos())
            })
            .collect();

        // main capture loop
        loop {
            // collect labels from both scene webviews and widget host windows
            let labels: Vec<String> = {
                let scene_labels: Vec<String> = {
                    let map = crate::platform::windows::interactive::player::WEB_PLAYER_LABELS
                        .lock()
                        .unwrap();
                    map.values().map(|info| info.label.clone()).collect()
                };
                let host_labels = super::widget_host::get_host_labels();
                let mut all = scene_labels;
                all.extend(host_labels);
                all
            };

            // stop if nothing is running
            if labels.is_empty() {
                break;
            }

            // read available audio packets from wasapi
            let mut got_data = false;
            loop {
                let packet_size = match capture_client.GetNextPacketSize() {
                    Ok(size) => size,
                    Err(e) => return Err(format!("wasapi GetNextPacketSize failed (device lost?): {:?}", e)),
                };
                if packet_size == 0 {
                    break;
                }

                let mut buffer_ptr: *mut u8 = std::ptr::null_mut();
                let mut frames_available = 0u32;
                let mut flags = 0u32;

                if let Err(e) = capture_client.GetBuffer(
                    &mut buffer_ptr,
                    &mut frames_available,
                    &mut flags,
                    None,
                    None,
                ) {
                    return Err(format!("wasapi GetBuffer failed: {:?}", e));
                }

                let frame_count = frames_available as usize;
                if frame_count > 0 && !buffer_ptr.is_null() {
                    got_data = true;

                    // interpret buffer based on bit depth
                    if bits_per_sample == 32 {
                        // 32-bit float samples (most common for wasapi shared mode)
                        let samples = std::slice::from_raw_parts(
                            buffer_ptr as *const f32,
                            frame_count * channels,
                        );
                        // downmix to mono and append to our sample buffer
                        for frame in 0..frame_count {
                            let mut mono = 0.0f32;
                            for ch in 0..channels {
                                mono += samples[frame * channels + ch];
                            }
                            mono /= channels as f32;
                            sample_buffer.push(mono);
                        }
                    } else if bits_per_sample == 16 {
                        // 16-bit integer samples
                        let samples = std::slice::from_raw_parts(
                            buffer_ptr as *const i16,
                            frame_count * channels,
                        );
                        for frame in 0..frame_count {
                            let mut mono = 0.0f32;
                            for ch in 0..channels {
                                mono += samples[frame * channels + ch] as f32 / 32768.0;
                            }
                            mono /= channels as f32;
                            sample_buffer.push(mono);
                        }
                    }

                    // check for silent flag (AUDCLNT_BUFFERFLAGS_SILENT = 0x2)
                    if (flags & 0x2) != 0 {
                        let start = sample_buffer.len().saturating_sub(frame_count);
                        for s in &mut sample_buffer[start..] {
                            *s = 0.0;
                        }
                    }
                }

                let _ = capture_client.ReleaseBuffer(frames_available);
            }

            // if no data was received from wasapi (e.g. silence or no audio playing),
            // inject roughly 16ms of silence so the visualizer naturally drops to zero
            if !got_data {
                let silent_frames = (sample_rate as f32 * 0.016) as usize;
                for _ in 0..silent_frames {
                    sample_buffer.push(0.0);
                }
            }

            // process fft when we have enough samples
            if sample_buffer.len() >= FFT_SIZE {
                // take the latest FFT_SIZE samples
                let start = sample_buffer.len() - FFT_SIZE;
                for i in 0..FFT_SIZE {
                    fft_buffer[i] = Complex::new(
                        sample_buffer[start + i] * hann_window[i],
                        0.0,
                    );
                }

                // trim sample buffer to act as a strict sliding window of exact FFT bounds
                if sample_buffer.len() > FFT_SIZE {
                    sample_buffer.drain(..sample_buffer.len() - FFT_SIZE);
                }

                // run fft in-place
                fft.process(&mut fft_buffer);

                // convert to magnitudes and map to output bands using log frequency scale
                let half = FFT_SIZE / 2;
                let min_freq = 20.0f32;
                let max_freq = (sample_rate as f32) / 2.0;
                let log_min = min_freq.ln();
                let log_max = max_freq.ln();

                for band in 0..OUTPUT_BANDS {
                    // logarithmic frequency mapping (matches human pitch perception)
                    let f_low = ((log_min
                        + (log_max - log_min) * band as f32 / OUTPUT_BANDS as f32)
                        .exp())
                        / max_freq
                        * half as f32;
                    let f_high = ((log_min
                        + (log_max - log_min) * (band + 1) as f32 / OUTPUT_BANDS as f32)
                        .exp())
                        / max_freq
                        * half as f32;

                    let bin_low = (f_low as usize).max(1).min(half - 1);
                    let bin_high = (f_high as usize).max(bin_low + 1).min(half);

                    // average the magnitudes in this frequency range
                    let mut sum = 0.0f32;
                    let mut count = 0;
                    for bin in bin_low..bin_high {
                        let mag = (fft_buffer[bin].re * fft_buffer[bin].re
                            + fft_buffer[bin].im * fft_buffer[bin].im)
                            .sqrt();
                        sum += mag;
                        count += 1;
                    }

                    let avg = if count > 0 { sum / count as f32 } else { 0.0 };

                    // convert to db scale for perceived loudness
                    let db = if avg > 1e-10 {
                        20.0 * avg.log10()
                    } else {
                        -100.0
                    };
                    // map roughly -60db..0db to 0..1
                    let normalized = ((db + 60.0) / 60.0).clamp(0.0, 1.0);
                    // squared curve for punchier visuals
                    output_bands[band] = normalized * normalized;
                }

                // calculate overall bass energy to drive the fake animation
                let mut bass_energy = 0.0f32;
                for i in 0..8 {
                    bass_energy += output_bands[i];
                }
                bass_energy /= 8.0;

                // smooth for less jitter and inject bass-driven fake reactivity
                use rand::Rng;
                let mut rng = rand::thread_rng();

                for i in 0..OUTPUT_BANDS {
                    // occasionally pick a new random target based on bass energy
                    if rng.gen::<f32>() < 0.25 {
                        target_fake_bands[i] = rng.gen::<f32>() * bass_energy * 2.2;
                    }
                    
                    // lerp the fake band towards its target
                    fake_bands[i] += (target_fake_bands[i] - fake_bands[i]) * 0.35;

                    // combine 40% real frequency with the fake bass-driven noise
                    let blended = (output_bands[i] * 0.4) + fake_bands[i];

                    // smooth the final result
                    smoothed_bands[i] += (blended - smoothed_bands[i]) * 0.35;
                }

                // build js payload — array of 128 floats
                let json_array: String = smoothed_bands
                    .iter()
                    .map(|v| format!("{:.4}", v))
                    .collect::<Vec<_>>()
                    .join(",");

                let js = format!(
                    "if(typeof window.colorwallAudioListener==='function')window.colorwallAudioListener([{}])",
                    json_array
                );

                // dispatch to all active wallpaper webview windows
                for label in &labels {
                    if let Some(window) = app.get_webview_window(label) {
                        let _ = window.eval(&js);
                    }
                }
            }

            // ~30fps update rate — smooth enough for visualization, not wasteful
            if !got_data {
                std::thread::sleep(std::time::Duration::from_millis(16));
            } else {
                std::thread::sleep(std::time::Duration::from_millis(33));
            }
        }

        // cleanup
        let _ = audio_client.Stop();
        CoUninitialize();

        Ok(())
    }
}
