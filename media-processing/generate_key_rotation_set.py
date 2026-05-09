import json

keys = [
    {"label": "P1", "key_id": "36ff7e0cd3961865b0f71b7ac775cf76", "key": "99bc7dc7f5a92dcb5bdf9af53d38c9e6"},
    {"label": "P2", "key_id": "1470ac58fbfa719e37d619cd74b91b0b", "key": "b3180d4897c72d952d5c8a90cb61403d"},
    {"label": "P3", "key_id": "40c5176350520fda6d9d35a44194640e", "key": "dc7bef66eab3c6213fe73503608e0242"},
    {"label": "P4", "key_id": "7ee07b93e9419b51feef9e2082151f51", "key": "c5a42477244d70fe4bc16b0c0055cf39"}
]

with open('license_keys.json', 'w') as f:
    json.dump(keys, f, indent=4)

print("--- [HỒI SINH] File license_keys.json đã sẵn sàng! ---")