# Activity read-only public HTTPS follow-up

Date: 2026-10-09. Scope: two fixed public GET requests with TLS verification, no credentials, redirect following, upload or server change. Status: partial observation; B4/J1 remain partial and B5 inactive.

The [Node/OpenSSL report](Activity-unified/public-node-2026-10-09.json), observed at 12:48:07 UTC, records a verified TLSv1.3 handshake for the About request to https://morii9961.top/zh/, followed by ECONNRESET before an HTTP response. The separate public manifest request to https://morii9961.top/status-data/current.json also ends with ECONNRESET but records no verified handshake. Both HTTP status fields are null. This is a change from the earlier all-unverified-handshake report, not evidence of a received page or publication.

Independent [Windows Schannel checks](Activity-unified/public-schannel-2026-10-09.json) return curl exit 35 and HTTP 000 for both addresses. Their recorded handshake errors do not undo the separate Node About handshake observation. Neither client receives an HTTP response. No 404, global outage, DNS failure or hosting cause is inferred.

[Hashed supplemental proof](Activity-unified/public-followup-2026-10-09.json) binds the raw reports and the script revision actually used. The raw Node report is preserved unchanged; this slice clarifies the script's limitation text to distinguish verified handshake followed by reset from an HTTP response. Source syntax, whitespace and existing evidence integrity checks pass. These partial public observations are outside the **52 reports / 783 selectors / 54 negative checks** passed evidence index and do not increase its acceptance counts.

Public observation/receiver deployment, production cutover and real publication remain unresolved. No personal Vault/archive, scheduler operation, credential, server, Moriium source or product binary is changed.
