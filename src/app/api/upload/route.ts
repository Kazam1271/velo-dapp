import { NextResponse } from 'next/server';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const jwt = process.env.PINATA_JWT;
    
    // 1. FORCE LOGGING TO THE TERMINAL
    console.log("--- UPLOAD API HIT ---");
    console.log("JWT Exists?", !!jwt);
    console.log("JWT Starts With:", jwt ? jwt.substring(0, 15) : "undefined");

    if (!jwt) {
      return NextResponse.json({ error: "Server missing PINATA_JWT" }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    // The client downscales avatars before sending (see downscaleAvatar), but
    // that can be bypassed and older clients don't do it — anything pinned here
    // is served back through a public IPFS gateway to every viewer, so cap it.
    if (file instanceof File) {
      if (file.type && !file.type.startsWith('image/')) {
        return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: `Image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.` },
          { status: 413 }
        );
      }
    }

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body: formData,
    });

    const data = await res.json();
    console.log("Pinata Response:", data);
    
    if (!res.ok) {
        return NextResponse.json({ error: data.error || "Pinata API Error", details: data }, { status: res.status });
    }
    
    return NextResponse.json(data);
  } catch (e) {
    console.error("Upload API Catch Error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
