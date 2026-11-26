-- Boot: pantalla de carga de Port Solano (igual que #boot del juego original):
-- fondo casi negro, "PORT SOLANO" con SOLANO en amarillo, mensaje y barra de progreso.

local Players = game:GetService("Players")
local ReplicatedFirst = game:GetService("ReplicatedFirst")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local ACCENT = Color3.fromRGB(0xff, 0xd1, 0x66)
local DIM = Color3.fromRGB(0x9a, 0xa7, 0xbb)

local gui = Instance.new("ScreenGui")
gui.Name = "PortSolanoBoot"
gui.IgnoreGuiInset = true
gui.DisplayOrder = 100
gui.ResetOnSpawn = false

local bg = Instance.new("Frame")
bg.Size = UDim2.fromScale(1, 1)
bg.BackgroundColor3 = Color3.fromRGB(0x05, 0x07, 0x0b)
bg.BorderSizePixel = 0
bg.Parent = gui

local title = Instance.new("TextLabel")
title.AnchorPoint = Vector2.new(0.5, 0.5)
title.Position = UDim2.new(0.5, 0, 0.5, -30)
title.Size = UDim2.new(0, 420, 0, 44)
title.BackgroundTransparency = 1
title.RichText = true
title.Font = Enum.Font.GothamBlack
title.TextSize = 34
title.TextColor3 = Color3.fromRGB(0xee, 0xf2, 0xf8)
title.Text = 'P O R T   <font color="#ffd166">S O L A N O</font>'
title.Parent = bg

local msg = Instance.new("TextLabel")
msg.AnchorPoint = Vector2.new(0.5, 0.5)
msg.Position = UDim2.new(0.5, 0, 0.5, 8)
msg.Size = UDim2.new(0, 420, 0, 18)
msg.BackgroundTransparency = 1
msg.Font = Enum.Font.Gotham
msg.TextSize = 13
msg.TextColor3 = DIM
msg.Text = "Starting engine…"
msg.Parent = bg

local bar = Instance.new("Frame")
bar.AnchorPoint = Vector2.new(0.5, 0.5)
bar.Position = UDim2.new(0.5, 0, 0.5, 34)
bar.Size = UDim2.new(0, 260, 0, 6)
bar.BackgroundColor3 = Color3.fromRGB(40, 44, 54)
bar.BorderSizePixel = 0
bar.Parent = bg
Instance.new("UICorner", bar).CornerRadius = UDim.new(1, 0)
local fill = Instance.new("Frame")
fill.Size = UDim2.fromScale(0, 1)
fill.BackgroundColor3 = ACCENT
fill.BorderSizePixel = 0
fill.Parent = bar
Instance.new("UICorner", fill).CornerRadius = UDim.new(1, 0)

gui.Parent = player:WaitForChild("PlayerGui")
ReplicatedFirst:RemoveDefaultLoadingScreen()

local function progress(f, text)
	msg.Text = text
	TweenService:Create(fill, TweenInfo.new(0.4), { Size = UDim2.fromScale(f, 1) }):Play()
end

progress(0.15, "Starting engine…")
if not game:IsLoaded() then
	game.Loaded:Wait()
end
progress(0.45, "Streaming the city…")
local t0 = os.clock()
while not workspace:GetAttribute("MapReady") and os.clock() - t0 < 90 do
	task.wait(0.2)
	fill.Size = UDim2.fromScale(math.min(0.9, 0.45 + (os.clock() - t0) / 60), 1)
end
if not player.Character then
	player.CharacterAdded:Wait()
end
task.wait(1) -- un momento para que llegue la ciudad cercana
progress(1, "Ready")
task.wait(0.4)
local info = TweenInfo.new(0.6)
for _, d in ipairs(bg:GetDescendants()) do
	if d:IsA("TextLabel") then
		TweenService:Create(d, info, { TextTransparency = 1 }):Play()
	elseif d:IsA("Frame") then
		TweenService:Create(d, info, { BackgroundTransparency = 1 }):Play()
	end
end
TweenService:Create(bg, info, { BackgroundTransparency = 1 }):Play()
task.wait(0.7)
gui:Destroy()
