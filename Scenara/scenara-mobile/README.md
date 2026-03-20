# Orryin Mobile — MVP

[![Expo](https://img.shields.io/badge/Expo-54-000020?logo=expo&logoColor=white)](#)
[![React Native](https://img.shields.io/badge/React%20Native-MVP-61DAFB?logo=react&logoColor=black)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](#)

Mobile MVP for **Orryin**, built with **Expo + React Native**, designed to validate the **user-facing flow** for onboarding, KYC initiation, and account readiness by integrating with the Orryin backend.

> **MVP intent:** frontend-to-backend flow validation — **not production-ready UI or App Store release**.

---

## What this MVP validates

- ✅ Mobile ↔ backend connectivity  
- ✅ Session-based user state (user + account)  
- ✅ End-to-end system test trigger (`/mvp/test-flow`)  
- ✅ KYC initiation (`/kyc/applicant`)  
- ✅ KYC status display readiness (`/kyc/status`)  
- ✅ Modular, scalable navigation structure  

---

## Tech stack

- **Expo (v54)**
- **React Native**
- **Expo Router**
- **TypeScript (strict mode)**
- **Axios** for API calls

---

## Project structure

```
orryin-mobile/
  app/
    _layout.tsx
    (tabs)/
      _layout.tsx        # Bottom tab navigation
      index.tsx          # Home (system test & session)
      kyc.tsx            # KYC initiation & status
      funding.tsx        # Placeholder (FX / funding)
      portfolio.tsx      # Placeholder (holdings)
  src/
    session/
      SessionContext.tsx # Persisted session state
    config/
      api.ts             # Backend base URL
    lib/
      api.ts             # Axios instance
  components/
  constants/
  hooks/
```

---

## Screen overview

### 🏠 Home
- Calls `/mvp/test-flow`
- Displays backend response snapshot
- Stores `user` and `account` in session context

### 🧾 KYC
- Uses real `user_id` from session
- Calls `/kyc/applicant`
- Designed to poll `/kyc/status` in future iterations

### 💳 Funding / 📊 Portfolio
- UI shells only
- Reserved for next-phase backend wiring

---

## Session handling

- Global `SessionContext`
- Persistent storage via `AsyncStorage`
- Hydration on app startup
- Clear separation between backend state and UI

---

## Local development

### 1) Install dependencies

```bash
npm install
# or
yarn install
```

### 2) Start Expo

```bash
npx expo start
```

Open via:
- Web: http://localhost:8081  
- iOS simulator / Android emulator  
- Physical device using Expo Go  

---

## Backend dependency

This app expects the backend to be running locally:

```
http://127.0.0.1:8000
```

Primary backend endpoints used:
- `POST /mvp/test-flow`
- `POST /kyc/applicant`
- `GET  /kyc/status`

---

## Environment & configuration

- Backend base URL is defined in `src/config/api.ts`
- No secrets should be committed
- `.env`, `.expo/`, and `node_modules/` must remain ignored

---

## Non-goals (by design)

This MVP intentionally excludes:
- Authentication (JWT / OAuth)
- Final UI/UX polish
- App Store configuration
- Production security hardening

These are deferred until architecture validation is complete.

---

## Status

- ✅ Mobile MVP complete
- 🟡 Funding & portfolio wiring pending
- 🟡 Auth & production UX pending
- 🟡 App Store readiness pending

---

## Disclaimer

This mobile app is a **technical MVP** intended solely for development and validation purposes.  
It is not production-ready and should not be distributed publicly.

---

## License

TBD
