# HUGOVERSE TikTok Race Bridge

Bridge online para a TikTok LIVE de **@itshugoverse**.

## Render manual config

- Name: `hugoverse-tiktok-bridge`
- Language: `Node`
- Branch: `main`
- Root Directory: `tiktok-race-bridge`
- Build Command: `npm install`
- Start Command: `npm start`
- Plan: `Free`
- Environment Variable: `TIKTOK_USERNAME=itshugoverse`

O Render fornece `PORT` automaticamente.

## Endpoints
- `/`
- `/health`
- WebSocket no próprio domínio, por exemplo:
  `wss://hugoverse-tiktok-bridge.onrender.com`

## Eventos
- comment
- like
- follow
- share
- gift
- bridgeStatus
- liveEnded
