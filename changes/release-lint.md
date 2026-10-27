### Internal

- `npm run release` runs `npm run lint` straight after `npm test`, so a release prepared locally fails on the same lint errors CI does (RFC 0005 §9.1, Decision 91).
