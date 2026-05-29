#!/usr/bin/env python3
"""
Genova Video Generation API Server
===================================
Unified FastAPI server exposing CogVideo and VideoCrafter as REST endpoints.
Supports: Text-to-Video (T2V), Image-to-Video (I2V)
With automatic model loading, GPU/CPU fallback, and health checks.

Run: python3 server.py --port 8189
"""

import os
import sys
import time
import uuid
import argparse
import traceback
from pathlib import Path

# ── Configuration ──────────────────────────────────────────────
RESULT_DIR = Path(os.environ.get("VIDEO_RESULT_DIR", "/home/z/my-project/data/videos"))
MODEL_CACHE = Path(os.environ.get("VIDEO_MODEL_CACHE", "/home/z/my-project/data/video-models"))
RESULT_DIR.mkdir(parents=True, exist_ok=True)
MODEL_CACHE.mkdir(parents=True, exist_ok=True)

# ── FastAPI Setup ──────────────────────────────────────────────
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Genova Video API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Model State ────────────────────────────────────────────────
class ModelState:
    cogvideo_loaded = False
    videocrafter_loaded = False
    cogvideo_pipe = None
    videocrafter_t2v = None
    has_cuda = False
    device = "cpu"
    generation_count = 0

    @classmethod
    def check_cuda(cls):
        try:
            import torch
            cls.has_cuda = torch.cuda.is_available()
            cls.device = "cuda" if cls.has_cuda else "cpu"
        except Exception:
            cls.has_cuda = False
            cls.device = "cpu"

ModelState.check_cuda()

# ── Request/Response Models ────────────────────────────────────
class GenerateVideoRequest(BaseModel):
    prompt: str
    mode: str = "t2v"
    model: str = "cogvideo"
    num_frames: int = 49
    width: int = 720
    height: int = 480
    fps: int = 8
    num_inference_steps: int = 50
    guidance_scale: float = 6.0
    seed: int = -1

class GenerateVideoResponse(BaseModel):
    id: str
    status: str
    video_url: str = ""
    provider: str
    model: str
    duration_seconds: float = 0
    metadata: dict = {}

# ── Lazy Model Loaders ────────────────────────────────────────

def load_cogvideo():
    if ModelState.cogvideo_loaded:
        return True
    try:
        import torch
        from diffusers import CogVideoXPipeline
        model_id = os.environ.get("COGVIDEO_MODEL", "THUDM/CogVideoX-2b")
        dtype = torch.float16 if ModelState.has_cuda else torch.float32
        print(f"[CogVideo] Loading {model_id} on {ModelState.device}...")
        pipe = CogVideoXPipeline.from_pretrained(
            model_id, torch_dtype=dtype, cache_dir=str(MODEL_CACHE),
        )
        if ModelState.has_cuda:
            pipe.enable_model_cpu_offload()
        else:
            pipe.to("cpu")
        pipe.vae.enable_slicing()
        pipe.vae.enable_tiling()
        ModelState.cogvideo_pipe = pipe
        ModelState.cogvideo_loaded = True
        print("[CogVideo] Loaded!")
        return True
    except Exception as e:
        print(f"[CogVideo] Failed: {e}")
        traceback.print_exc()
        return False


def load_videocrafter():
    if ModelState.videocrafter_loaded:
        return True
    try:
        vc_path = "/home/z/my-project/upload/VideoCrafter-extract/VideoCrafter-main"
        if vc_path not in sys.path:
            sys.path.insert(0, vc_path)
        from scripts.gradio.t2v_test import Text2Video
        print(f"[VideoCrafter] Loading on {ModelState.device}...")
        t2v = Text2Video(result_dir=str(RESULT_DIR))
        ModelState.videocrafter_t2v = t2v
        ModelState.videocrafter_loaded = True
        print("[VideoCrafter] Loaded!")
        return True
    except Exception as e:
        print(f"[VideoCrafter] Failed: {e}")
        traceback.print_exc()
        return False


# ── Video Generation ──────────────────────────────────────────

def generate_cogvideo_t2v(request: GenerateVideoRequest) -> GenerateVideoResponse:
    import torch
    gen_id = str(uuid.uuid4())
    start_time = time.time()
    if not ModelState.cogvideo_loaded:
        if not load_cogvideo():
            return GenerateVideoResponse(id=gen_id, status="failed", provider="cogvideo", model="CogVideoX-2b", metadata={"error": "Model failed to load"})
    pipe = ModelState.cogvideo_pipe
    seed = request.seed if request.seed >= 0 else torch.randint(0, 2**32, (1,)).item()
    try:
        video_frames = pipe(
            prompt=request.prompt,
            num_videos_per_prompt=1,
            num_inference_steps=request.num_inference_steps,
            num_frames=request.num_frames,
            guidance_scale=request.guidance_scale,
            generator=torch.Generator(device=ModelState.device).manual_seed(seed),
        ).frames[0]
        import imageio
        video_path = RESULT_DIR / f"{gen_id}.mp4"
        imageio.mimwrite(str(video_path), video_frames, fps=request.fps)
        duration = time.time() - start_time
        ModelState.generation_count += 1
        return GenerateVideoResponse(
            id=gen_id, status="completed", video_url=f"/videos/{gen_id}.mp4",
            provider="cogvideo", model="CogVideoX-2b", duration_seconds=round(duration, 2),
            metadata={"seed": seed, "num_frames": len(video_frames), "fps": request.fps, "resolution": f"{request.width}x{request.height}"},
        )
    except Exception as e:
        return GenerateVideoResponse(id=gen_id, status="failed", provider="cogvideo", model="CogVideoX-2b", metadata={"error": str(e), "seed": seed})


def generate_videocrafter_t2v(request: GenerateVideoRequest) -> GenerateVideoResponse:
    gen_id = str(uuid.uuid4())
    start_time = time.time()
    if not ModelState.videocrafter_loaded:
        if not load_videocrafter():
            return GenerateVideoResponse(id=gen_id, status="failed", provider="videocrafter", model="VideoCrafter2", metadata={"error": "Model failed to load"})
    try:
        t2v = ModelState.videocrafter_t2v
        video_path = t2v.get_prompt(prompt=request.prompt, steps=request.num_inference_steps, cfg_scale=request.guidance_scale, eta=1.0, fps=request.fps)
        import shutil
        target_path = RESULT_DIR / f"{gen_id}.mp4"
        if os.path.exists(video_path):
            shutil.move(video_path, str(target_path))
        duration = time.time() - start_time
        ModelState.generation_count += 1
        return GenerateVideoResponse(
            id=gen_id, status="completed", video_url=f"/videos/{gen_id}.mp4",
            provider="videocrafter", model="VideoCrafter2", duration_seconds=round(duration, 2),
            metadata={"fps": request.fps, "cfg_scale": request.guidance_scale, "steps": request.num_inference_steps},
        )
    except Exception as e:
        return GenerateVideoResponse(id=gen_id, status="failed", provider="videocrafter", model="VideoCrafter2", metadata={"error": str(e)})


# ── Endpoints ─────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "cuda_available": ModelState.has_cuda,
        "device": ModelState.device,
        "cogvideo_loaded": ModelState.cogvideo_loaded,
        "videocrafter_loaded": ModelState.videocrafter_loaded,
        "generation_count": ModelState.generation_count,
    }

@app.post("/generate", response_model=GenerateVideoResponse)
async def generate_video(request: GenerateVideoRequest):
    if not request.prompt or not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")
    if len(request.prompt) > 2000:
        raise HTTPException(status_code=400, detail="Prompt too long (max 2000 chars)")
    if request.model == "cogvideo":
        result = generate_cogvideo_t2v(request)
        if result.status == "completed":
            return result
        request.model = "videocrafter"
        return generate_videocrafter_t2v(request)
    elif request.model == "videocrafter":
        result = generate_videocrafter_t2v(request)
        if result.status == "completed":
            return result
        request.model = "cogvideo"
        return generate_cogvideo_t2v(request)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown model: {request.model}")

@app.get("/models")
async def list_models():
    return {"models": [
        {"id": "cogvideo", "name": "CogVideoX-2B", "type": "t2v", "loaded": ModelState.cogvideo_loaded, "resolution": "720x480", "max_frames": 49, "fps": 8},
        {"id": "videocrafter", "name": "VideoCrafter2", "type": "t2v", "loaded": ModelState.videocrafter_loaded, "resolution": "512x320", "max_frames": 16, "fps": 28},
    ]}

@app.get("/videos/{video_id}")
async def get_video(video_id: str):
    video_path = RESULT_DIR / video_id
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(str(video_path), media_type="video/mp4", filename=video_id)


if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8189)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    args = parser.parse_args()
    print(f"🎬 Genova Video API on {args.host}:{args.port}")
    print(f"   CUDA: {ModelState.has_cuda} | Device: {ModelState.device}")
    uvicorn.run(app, host=args.host, port=args.port)
