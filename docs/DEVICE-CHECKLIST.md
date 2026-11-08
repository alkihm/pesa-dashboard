# Device checklist ([5.1])

For the owner. CI already runs every screen in Chrome's engine (phone and desktop), Safari's engine (WebKit, as an
iPhone) and Firefox, with the accessibility checks from [A11Y.md](A11Y.md). What CI cannot do is a real
iPhone: installing to the Home Screen, push notifications, airplane mode, VoiceOver. That is this list.

Use the dev preview, **https://pesa-dev.autotechfy.com**, signed in with your Google account. Nothing here needs real
money data, and nothing writes to production. Tick each line, then add a row to **Results** at the end.
Anything that fails: note the step number and what you saw, and a session picks it up.

## iPhone (Safari, then the Home Screen app)

**Install**
1. Open the preview in Safari → Share → **Add to Home Screen**. The icon and the name "Budget" look right.
2. Open it from the Home Screen: no Safari address bar, the status bar matches the header colour.
3. Sign in with Google, choose a PIN. Close the app fully and open it again: it asks for the PIN, not Google.

**Screens and themes**
4. Walk Overview, Activity, Month, Bills, Review, Accounts, Settings. Nothing is cut off and nothing scrolls
   sideways.
5. Settings → **Theme** → Dark, then Light. Every screen you walked still reads
   clearly in both.
6. Turn the phone sideways on Overview: the layout reflows, nothing overlaps.

**Offline**
7. Turn on airplane mode. Open the app from the Home Screen: it opens, with the last data you saw.
8. Still offline, open a transaction in Activity and change its category → Save. Settings · 🔄 Data & sync lists
   it as waiting.
9. Turn airplane mode off and open the app: the queue empties and Activity shows the new category. Change it back.
   (The app has no delete, so use an edit rather than adding a test transaction.)

**Push notifications** (Home Screen app only, iOS 16.4 or later)
10. Settings → Notifications → **Turn on** → allow. Then **Send a test**: a notification arrives within a minute.
11. Tap the notification: the app opens on the right screen.

**Accessibility**
12. Settings (iOS) → Accessibility → VoiceOver on. Swipe through Overview, Add transaction and Settings: each item is
    read out with a sensible name (no "button" with no name). VoiceOver off.
13. Settings (iOS) → Display & Brightness → Text Size, two steps larger. Overview and Add transaction still fit.

**Other**
14. Month → Report → Download PDF → Save to Files: one A4 page.
15. Settings → Export everything: the .zip downloads.

## Desktop browsers

At full width and narrow (drag the window to phone width). Sign in, walk the main screens, switch the theme.

16. **Chrome** on Windows.
17. **Edge** on Windows.
18. **Safari** on a Mac, if one is to hand (otherwise CI's WebKit run stands in).
19. Install from Chrome or Edge (the install icon in the address bar): it opens in its own window.

## Results

| Date | Device and browser | Steps | Result and notes |
|---|---|---|---|
| | iPhone (model, iOS version), Safari + Home Screen | 1–15 | |
| | Windows, Chrome | 16, 19 | |
| | Windows, Edge | 17, 19 | |
| | Mac, Safari | 18 | |
