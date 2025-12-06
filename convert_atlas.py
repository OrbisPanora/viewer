import json

# Charger le JSON existant
with open('public/MCBlocksBlackOutline.json', 'r', encoding='utf-8') as f:
    old_data = json.load(f)

# Liste des noms de blocs Minecraft (dans l'ordre de l'image)
# Basé sur l'image typique d'atlas Minecraft isométrique
minecraft_blocks = [
    "acacia_log", "acacia_planks", "allium", "amethyst_block", "ancient_debris",
    "andesite", "anvil", "azalea_leaves", "azure_bluet", "bamboo_planks",
    "barrel", "basalt", "beacon", "bedrock", "bee_nest",
    "beehive", "beetroots", "bell", "birch_log", "birch_planks",
    "black_concrete", "black_concrete_powder", "black_terracotta", "blackstone", "blast_furnace",
    "blue_concrete", "blue_concrete_powder", "blue_ice", "blue_orchid", "blue_terracotta",
    "bone_block", "bookshelf", "brain_coral_block", "brewing_stand", "bricks",
    "brown_concrete", "brown_concrete_powder", "brown_mushroom", "brown_terracotta", "bubble_coral_block",
    "cactus", "cake", "calcite", "campfire", "candle",
    "carrots", "cartography_table", "carved_pumpkin", "cauldron", "chain",
    "cherry_leaves", "cherry_log", "cherry_planks", "cherry_sapling", "chest",
    "chipped_anvil", "chiseled_bookshelf", "clay", "coal_block", "coal_ore",
    "coarse_dirt", "cobbled_deepslate", "cobblestone", "cocoa", "composter",
    "copper_block", "copper_ore", "cornflower", "cracked_stone_bricks", "crafting_table",
    "crimson_fungus", "crimson_nylium", "crimson_planks", "crimson_roots", "crimson_stem",
    "crying_obsidian", "cut_copper", "cyan_concrete", "cyan_concrete_powder", "cyan_terracotta",
    "damaged_anvil", "dandelion", "dark_oak_log", "dark_oak_planks", "dark_prismarine",
    "daylight_detector", "dead_brain_coral_block", "dead_bubble_coral_block", "dead_bush", "dead_fire_coral_block",
    "dead_horn_coral_block", "dead_tube_coral_block", "deepslate", "deepslate_bricks", "deepslate_coal_ore",
    "deepslate_copper_ore", "deepslate_diamond_ore", "deepslate_emerald_ore", "deepslate_gold_ore", "deepslate_iron_ore",
    "deepslate_lapis_ore", "deepslate_redstone_ore", "deepslate_tiles", "detector_rail", "diamond_block",
    "diamond_ore", "diorite", "dirt", "dirt_path", "dispenser",
    "dragon_egg", "dried_kelp_block", "dripstone_block", "dropper", "emerald_block",
    "emerald_ore", "enchanting_table", "end_portal_frame", "end_stone", "end_stone_bricks",
    "ender_chest", "exposed_copper", "farmland", "fern", "fire_coral_block",
    "fletching_table", "flower_pot", "flowering_azalea", "flowering_azalea_leaves", "frosted_ice",
    "furnace", "gilded_blackstone", "glass", "glowstone", "gold_block",
    "gold_ore", "granite", "grass", "grass_block", "gravel",
    "gray_concrete", "gray_concrete_powder", "gray_terracotta", "green_concrete", "green_concrete_powder",
    "green_terracotta", "grindstone", "hanging_roots", "hay_block", "heavy_weighted_pressure_plate",
    "honey_block", "honeycomb_block", "hopper", "horn_coral_block", "ice",
    "infested_stone", "iron_bars", "iron_block", "iron_door", "iron_ore",
    "iron_trapdoor", "jack_o_lantern", "jukebox", "jungle_log", "jungle_planks",
    "kelp", "kelp_plant", "ladder", "lantern", "lapis_block",
    "lapis_ore", "large_amethyst_bud", "large_fern", "lava", "lectern",
    "lever", "light_blue_concrete", "light_blue_concrete_powder", "light_blue_terracotta", "light_gray_concrete",
    "light_gray_concrete_powder", "light_gray_terracotta", "lilac", "lily_of_the_valley", "lily_pad",
    "lime_concrete", "lime_concrete_powder", "lime_terracotta", "lodestone", "loom",
    "magenta_concrete", "magenta_concrete_powder", "magenta_terracotta", "magma_block", "mangrove_log",
    "mangrove_planks", "mangrove_propagule", "mangrove_roots", "medium_amethyst_bud", "melon",
    "melon_stem", "moss_block", "moss_carpet", "mossy_cobblestone", "mossy_stone_bricks",
    "mud", "mud_bricks", "mushroom_stem", "mycelium", "nether_bricks",
    "nether_gold_ore", "nether_portal", "nether_quartz_ore", "nether_sprouts", "nether_wart",
    "nether_wart_block", "netherite_block", "netherrack", "note_block", "oak_leaves",
    "oak_log", "oak_planks", "oak_sapling", "observer", "obsidian",
    "ochre_froglight", "orange_concrete", "orange_concrete_powder", "orange_terracotta", "orange_tulip",
    "oxeye_daisy", "oxidized_copper", "packed_ice", "packed_mud", "pearlescent_froglight",
    "peony", "pink_concrete", "pink_concrete_powder", "pink_petals", "pink_terracotta",
    "pink_tulip", "piston", "podzol", "pointed_dripstone", "polished_andesite",
    "polished_basalt", "polished_blackstone", "polished_blackstone_bricks", "polished_deepslate", "polished_diorite",
    "polished_granite", "poppy", "potatoes", "potted_azalea_bush", "potted_bamboo",
    "potted_cactus", "potted_dandelion", "potted_flowering_azalea_bush", "potted_mangrove_propagule", "potted_oak_sapling",
    "potted_orchid", "potted_poppy", "potted_red_tulip", "potted_torchflower", "powder_snow",
    "powered_rail", "prismarine", "prismarine_bricks", "pumpkin", "pumpkin_stem",
    "purple_concrete", "purple_concrete_powder", "purple_terracotta", "purpur_block", "purpur_pillar",
    "quartz_block", "quartz_bricks", "quartz_pillar", "rail", "raw_copper_block",
    "raw_gold_block", "raw_iron_block", "red_concrete", "red_concrete_powder", "red_mushroom",
    "red_mushroom_block", "red_nether_bricks", "red_sand", "red_sandstone", "red_terracotta",
    "red_tulip", "redstone_block", "redstone_lamp", "redstone_ore", "redstone_torch",
    "reinforced_deepslate", "repeater", "respawn_anchor", "rooted_dirt", "rose_bush",
    "sand", "sandstone", "scaffolding", "sculk", "sculk_catalyst",
    "sculk_sensor", "sculk_shrieker", "sculk_vein", "sea_lantern", "sea_pickle",
    "seagrass", "shroomlight", "shulker_box", "slime_block", "small_amethyst_bud",
    "small_dripleaf", "smithing_table", "smoker", "smooth_basalt", "smooth_stone",
    "sniffer_egg", "snow", "snow_block", "soul_campfire", "soul_fire",
    "soul_lantern", "soul_sand", "soul_soil", "soul_torch", "spawner",
    "sponge", "spore_blossom", "spruce_leaves", "spruce_log", "spruce_planks",
    "spruce_sapling", "stone", "stone_bricks", "stonecutter", "stripped_acacia_log",
    "stripped_bamboo_block", "stripped_birch_log", "stripped_cherry_log", "stripped_crimson_stem", "stripped_dark_oak_log",
    "stripped_jungle_log", "stripped_mangrove_log", "stripped_oak_log", "stripped_spruce_log", "stripped_warped_stem",
    "sugar_cane", "sunflower", "suspicious_gravel", "suspicious_sand", "sweet_berry_bush",
    "tall_grass", "tall_seagrass", "target", "terracotta", "tinted_glass",
    "tnt", "torch", "torchflower", "torchflower_crop", "trapped_chest",
    "tube_coral_block", "tuff", "turtle_egg", "twisting_vines", "verdant_froglight",
    "vine", "warped_fungus", "warped_nylium", "warped_planks", "warped_roots",
    "warped_stem", "warped_wart_block", "water", "weathered_copper", "weeping_vines",
    "wet_sponge", "wheat", "white_concrete", "white_concrete_powder", "white_terracotta",
    "white_tulip", "wither_rose", "yellow_concrete", "yellow_concrete_powder", "yellow_terracotta"
]

# Créer le nouveau format
frames = {}
sprite_index = 0

for i, sprite in enumerate(old_data):
    # Obtenir le nom du bloc (ou utiliser le nom générique si on dépasse la liste)
    if sprite_index < len(minecraft_blocks):
        block_name = minecraft_blocks[sprite_index]
    else:
        block_name = f"unknown_block_{sprite_index}"
    
    frame_name = f"{block_name}.webp"
    
    frames[frame_name] = {
        "frame": {
            "x": sprite["x"],
            "y": sprite["y"],
            "w": sprite["width"],
            "h": sprite["height"]
        },
        "rotated": False,
        "trimmed": False,
        "spriteSourceSize": {
            "x": 0,
            "y": 0,
            "w": sprite["width"],
            "h": sprite["height"]
        },
        "sourceSize": {
            "w": sprite["width"],
            "h": sprite["height"]
        }
    }
    
    sprite_index += 1

# Créer le JSON final au format Pixi.js
output = {
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
with open('public/MCBlocksBlackOutline_fixed.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(f"✅ Conversion terminée !")
print(f"📊 {len(frames)} sprites convertis")
print(f"📝 Fichier sauvegardé: MCBlocksBlackOutline_fixed.json")
