$base = 'https://raw.githubusercontent.com/hoangpx/age-of-tinies/master/art'
$out = Join-Path (Split-Path $PSScriptRoot) 'client\public\assets\tiny-swords'

# destino => caminho no repo (nomes com espaço serão URL-encodados)
$files = @{
  # Tropas azuis
  'units/warrior_blue_idle.png'   = 'Units/Blue Units/Warrior/Warrior_Idle.png'
  'units/warrior_blue_run.png'    = 'Units/Blue Units/Warrior/Warrior_Run.png'
  'units/warrior_blue_attack.png' = 'Units/Blue Units/Warrior/Warrior_Attack1.png'
  'units/archer_blue_idle.png'    = 'Units/Blue Units/Archer/Archer_Idle.png'
  'units/archer_blue_run.png'     = 'Units/Blue Units/Archer/Archer_Run.png'
  'units/archer_blue_attack.png'  = 'Units/Blue Units/Archer/Archer_Shoot.png'
  'units/pawn_blue_idle.png'      = 'Pawn and Resources/Pawn/Blue Pawn/Pawn_Idle.png'
  'units/pawn_blue_run.png'       = 'Pawn and Resources/Pawn/Blue Pawn/Pawn_Run.png'
  'units/pawn_blue_attack.png'    = 'Pawn and Resources/Pawn/Blue Pawn/Pawn_Interact Knife.png'
  # Tropas vermelhas
  'units/warrior_red_idle.png'    = 'Units/Red Units/Warrior/Warrior_Idle.png'
  'units/warrior_red_run.png'     = 'Units/Red Units/Warrior/Warrior_Run.png'
  'units/warrior_red_attack.png'  = 'Units/Red Units/Warrior/Warrior_Attack1.png'
  'units/archer_red_idle.png'     = 'Units/Red Units/Archer/Archer_Idle.png'
  'units/archer_red_run.png'      = 'Units/Red Units/Archer/Archer_Run.png'
  'units/archer_red_attack.png'   = 'Units/Red Units/Archer/Archer_Shoot.png'
  'units/pawn_red_idle.png'       = 'Pawn and Resources/Pawn/Red Pawn/Pawn_Idle.png'
  'units/pawn_red_run.png'        = 'Pawn and Resources/Pawn/Red Pawn/Pawn_Run.png'
  'units/pawn_red_attack.png'     = 'Pawn and Resources/Pawn/Red Pawn/Pawn_Interact Knife.png'
  # Construções
  'buildings/castle_blue.png'     = 'Buildings/Blue Buildings/Castle.png'
  'buildings/castle_red.png'      = 'Buildings/Red Buildings/Castle.png'
  'buildings/tower_blue.png'      = 'Buildings/Blue Buildings/Tower.png'
  'buildings/tower_red.png'       = 'Buildings/Red Buildings/Tower.png'
  # Efeitos
  'fx/explosion.png'              = 'Particle FX/Explosion_01.png'
  'fx/fire.png'                   = 'Particle FX/Fire_01.png'
  # Decoração
  'deco/tree1.png'                = 'Pawn and Resources/Wood/Trees/Tree1.png'
  'deco/tree2.png'                = 'Pawn and Resources/Wood/Trees/Tree2.png'
  'deco/tree3.png'                = 'Pawn and Resources/Wood/Trees/Tree3.png'
  'deco/bush1.png'                = 'Terrain/Decorations/Bushes/Bush 1.png'
  'deco/bush2.png'                = 'Terrain/Decorations/Bushes/Bush 2.png'
  'deco/rock1.png'                = 'Terrain/Decorations/Rocks/Rock1.png'
  'deco/rock2.png'                = 'Terrain/Decorations/Rocks/Rock2.png'
  'deco/water_rocks.png'          = 'Terrain/Decorations/Rocks in the Water/Water Rocks_01.png'
}

$ok = 0; $fail = @()
foreach ($dest in $files.Keys) {
  $destPath = Join-Path $out $dest
  New-Item -ItemType Directory -Force (Split-Path $destPath) | Out-Null
  $src = $files[$dest] -replace ' ', '%20'
  try {
    Invoke-WebRequest -Uri "$base/$src" -OutFile $destPath -ErrorAction Stop
    $ok++
  } catch {
    $fail += $files[$dest]
  }
}
Write-Host "baixados: $ok / $($files.Count)"
if ($fail) { Write-Host "falharam:"; $fail | ForEach-Object { Write-Host "  $_" } }

# Dimensões dos spritesheets (para configurar frames no Phaser)
Add-Type -AssemblyName System.Drawing
Get-ChildItem $out -Recurse -Filter *.png | ForEach-Object {
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  "{0,-38} {1}x{2}" -f $_.FullName.Substring($out.Length + 1), $img.Width, $img.Height
  $img.Dispose()
}
