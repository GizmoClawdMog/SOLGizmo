
## LIVE TRADES FEED — LAW
After EVERY buy or sell, immediately:
1. Update `/Users/younghogey/.openclaw/workspace/SOLGizmo/trades.json`
   - Add new trade at TOP of array
   - Format: {"n":N,"date":"YYYY-MM-DD","token":"$TOKEN","action":"BUY/SELL","amount":"X SOL","result":"description","pnl":"+X SOL","color":"teal/red","ca":"CA_HERE","ts":UNIX}
2. Run: cd /Users/younghogey/.openclaw/workspace/SOLGizmo && git add trades.json && git commit -m "trade #N" && git push
3. This updates solgizmo.com live within 30 seconds.
4. NEVER skip this. This is LAW I compliance — full transparency.
