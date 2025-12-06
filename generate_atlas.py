import json

# Liste des noms de blocs Minecraft dans l'ordre de votre spritesheet
# IMPORTANT: Modifiez cette liste selon l'ordre réel dans votre image
block_names = [
    "bedrock", "stone", "dirt", "grass_block", "cobblestone",
    "oak_planks", "oak_log", "oak_leaves", "glass", "sand",
    # ... ajoutez tous vos blocs ici dans l'ordre
]

# Configuration
SPRITE_WIDTH = 24
SPRITE_HEIGHT = 24
PADDING = 4  # Espace entre les sprites
START_X = 4
START_Y = 4
SPRITES_PER_ROW = 40  # Nombre de sprites par ligne dans votre atlas

frames = {}
x = START_X
y = START_Y
sprite_count = 0

# Générer les entrées pour chaque bloc (left et top)
for block_name in block_names:
    for suffix in ["_left", "_top"]:
        frame_name = f"{block_name}{suffix}.webp"
        
        frames[frame_name] = {
            "frame": {"x": x, "y": y, "w": SPRITE_WIDTH, "h": SPRITE_HEIGHT},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": SPRITE_WIDTH, "h": SPRITE_HEIGHT},
            "sourceSize": {"w": SPRITE_WIDTH, "h": SPRITE_HEIGHT}
        }
        
        # Calculer la position suivante
        sprite_count += 1
        if sprite_count % SPRITES_PER_ROW == 0:
            # Nouvelle ligne
            x = START_X
            y += SPRITE_HEIGHT + PADDING
        else:
            # Sprite suivant sur la même ligne
            x += SPRITE_WIDTH + PADDING

# Créer le JSON final
atlas_json = {
    "frames": frames,
    "meta": {
        "app": "MCBlocksAtlasGenerator",
        "version": "1.0",
        "image": "MCBlocksBlackOutline.png",
        "format": "RGBA8888",
        "size": {"w": 4096, "h": 4096},
        "scale": "1"
    }
}

# Sauvegarder
with open("MCBlocksBlackOutline_correct.json", "w", encoding="utf-8") as f:
    json.dump(atlas_json, f, indent=2)

print(f"✅ JSON généré avec {len(frames)} sprites!")
print("📝 N'oubliez pas de modifier la liste 'block_names' avec vos vrais noms de blocs")
