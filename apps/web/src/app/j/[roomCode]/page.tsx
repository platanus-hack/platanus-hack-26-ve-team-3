import type { Metadata } from "next";
import { RoomJoin } from "@/components/room/RoomJoin";

export const metadata: Metadata = { title: "Entrar a la sala" };

export default async function JoinRoomPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  return <RoomJoin roomCode={roomCode} />;
}
