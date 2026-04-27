import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file: File | null = data.get("file") as unknown as File;
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Prepare the data for Pinata
    const formData = new FormData();
    formData.append("file", file);

    // Send to Pinata
    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
      },
      body: formData,
    });

    const pinataData = await res.json();
    
    if (!res.ok) {
      console.error("Pinata Error:", pinataData);
      throw new Error(pinataData.error?.details || "Failed to pin to IPFS");
    }

    // Return the IPFS hash (CID) to the frontend
    return NextResponse.json({ IpfsHash: pinataData.IpfsHash }, { status: 200 });
    
  } catch (e: any) {
    console.error("Upload API Error:", e);
    return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
  }
}
