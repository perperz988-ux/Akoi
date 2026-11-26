-- Vehicles: fabrica de coches, coches aparcados por el mapa y coche personal
-- (boton "Coche" en pantalla). La conduccion la hace el cliente (CarController)
-- y el servidor le da la propiedad de red del coche mientras conduce.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Layout = require(ReplicatedStorage:WaitForChild("Layout"))

local function getRemote(name)
	local f = ReplicatedStorage:FindFirstChild("Remotes")
	if not f then
		f = Instance.new("Folder")
		f.Name = "Remotes"
		f.Parent = ReplicatedStorage
	end
	local r = f:FindFirstChild(name)
	if not r then
		r = Instance.new("RemoteEvent")
		r.Name = name
		r.Parent = f
	end
	return r
end
local SpawnCarRemote = getRemote("SpawnCar")

while not workspace:GetAttribute("MapReady") do
	task.wait(0.2)
end

local carsFolder = Instance.new("Folder")
carsFolder.Name = "Coches"
carsFolder.Parent = workspace

local M = Enum.Material
local rng = Random.new()

local CAR_COLORS = {
	Color3.fromRGB(220, 40, 60),
	Color3.fromRGB(255, 140, 30),
	Color3.fromRGB(250, 210, 40),
	Color3.fromRGB(40, 190, 120),
	Color3.fromRGB(30, 150, 230),
	Color3.fromRGB(120, 70, 210),
	Color3.fromRGB(255, 110, 180),
	Color3.fromRGB(245, 245, 245),
	Color3.fromRGB(30, 30, 34),
	Color3.fromRGB(80, 230, 230),
}

local CAR_NAMES = { "Solano GT", "Vela Cruiser", "Reef Runner", "Palmetto", "Bayshore S", "Coral Sport" }

local function weldPart(model, chassis, size, offset, color, material, props)
	local p = Instance.new("Part")
	p.Size = size
	p.CFrame = chassis.CFrame * offset
	p.Color = color
	p.Material = material
	p.Massless = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	if props then
		for k, v in pairs(props) do
			p[k] = v
		end
	end
	p.Parent = model
	local w = Instance.new("WeldConstraint")
	w.Part0 = chassis
	w.Part1 = p
	w.Parent = p
	return p
end

-- groundCF: CFrame a nivel del suelo; el frente del coche mira a -Z
local function buildCar(groundCF, color, sporty)
	local model = Instance.new("Model")
	model.Name = CAR_NAMES[rng:NextInteger(1, #CAR_NAMES)]
	model.ModelStreamingMode = Enum.ModelStreamingMode.Atomic

	local chassis = Instance.new("Part")
	chassis.Name = "Chassis"
	chassis.Size = Vector3.new(6, 1.7, 11) -- al conducir flota 0.25 sobre el suelo
	chassis.CFrame = groundCF * CFrame.new(0, 1.1, 0)
	chassis.Transparency = 1
	chassis.CustomPhysicalProperties = PhysicalProperties.new(3, 0.6, 0.1)
	chassis.RootPriority = 10
	chassis.Parent = model
	model.PrimaryPart = chassis

	local bodyH = if sporty then 1.6 else 2
	local cabinH = if sporty then 1.4 else 1.9
	-- carroceria (coordenadas relativas al centro del chasis, que esta a 1.1 del suelo)
	weldPart(model, chassis, Vector3.new(6.2, bodyH, 11.4), CFrame.new(0, 0.1 + bodyH / 2, 0), color, M.SmoothPlastic, { Reflectance = 0.08 })
	weldPart(model, chassis, Vector3.new(5.4, cabinH, if sporty then 5 else 6), CFrame.new(0, 0.1 + bodyH + cabinH / 2, 0.8), Color3.fromRGB(40, 50, 60), M.Glass, { Transparency = 0.35 })
	weldPart(model, chassis, Vector3.new(5.6, 0.3, if sporty then 5.2 else 6.2), CFrame.new(0, 0.1 + bodyH + cabinH + 0.15, 0.8), color, M.SmoothPlastic)
	-- parachoques
	weldPart(model, chassis, Vector3.new(6.4, 0.8, 0.6), CFrame.new(0, 0.5, -5.8), Color3.fromRGB(40, 40, 44), M.SmoothPlastic)
	weldPart(model, chassis, Vector3.new(6.4, 0.8, 0.6), CFrame.new(0, 0.5, 5.8), Color3.fromRGB(40, 40, 44), M.SmoothPlastic)
	-- faros y pilotos
	for _, x in ipairs({ -2.2, 2.2 }) do
		weldPart(model, chassis, Vector3.new(1.2, 0.5, 0.2), CFrame.new(x, 0.1 + bodyH - 0.5, -5.75), Color3.fromRGB(255, 250, 220), M.Neon)
		weldPart(model, chassis, Vector3.new(1.2, 0.5, 0.2), CFrame.new(x, 0.1 + bodyH - 0.5, 5.75), Color3.fromRGB(255, 30, 30), M.Neon)
	end
	-- ruedas (cilindros, eje X), solo decorativas
	for _, x in ipairs({ -2.9, 2.9 }) do
		for _, z in ipairs({ -3.6, 3.6 }) do
			weldPart(model, chassis, Vector3.new(1, 2.5, 2.5), CFrame.new(x, 0.15, z), Color3.fromRGB(25, 25, 25), M.SmoothPlastic, { Shape = Enum.PartType.Cylinder, CanCollide = false })
			weldPart(model, chassis, Vector3.new(1.05, 1.4, 1.4), CFrame.new(x, 0.15, z), Color3.fromRGB(190, 190, 195), M.Metal, { Shape = Enum.PartType.Cylinder, CanCollide = false })
		end
	end

	local seat = Instance.new("VehicleSeat")
	seat.Name = "DriveSeat"
	seat.Size = Vector3.new(2, 0.5, 2)
	seat.CFrame = chassis.CFrame * CFrame.new(-1.3, 0.9, 0.6)
	seat.Transparency = 1
	seat.CanCollide = false
	seat.Massless = true
	seat.MaxSpeed = 0
	seat.Torque = 0
	seat.HeadsUpDisplay = false
	seat:SetAttribute("PSCar", true)
	seat.Parent = model
	local sw = Instance.new("WeldConstraint")
	sw.Part0 = chassis
	sw.Part1 = seat
	sw.Parent = seat

	-- fuerzas que usa el CarController del cliente
	local att = Instance.new("Attachment")
	att.Name = "DriveAttachment"
	att.Parent = chassis
	local lv = Instance.new("LinearVelocity")
	lv.Name = "Drive"
	lv.Attachment0 = att
	lv.RelativeTo = Enum.ActuatorRelativeTo.World
	lv.VelocityConstraintMode = Enum.VelocityConstraintMode.Vector
	lv.ForceLimitMode = Enum.ForceLimitMode.PerAxis
	lv.MaxAxesForce = Vector3.zero
	lv.VectorVelocity = Vector3.zero
	lv.Enabled = false
	lv.Parent = chassis
	local ao = Instance.new("AlignOrientation")
	ao.Name = "Steer"
	ao.Mode = Enum.OrientationAlignmentMode.OneAttachment
	ao.Attachment0 = att
	ao.MaxTorque = 1e8
	ao.Responsiveness = 40
	ao.CFrame = CFrame.new()
	ao.Enabled = false
	ao.Parent = chassis

	-- boton para subirse (comodo en movil)
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Conducir"
	prompt.ObjectText = model.Name
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = 12
	prompt.RequiresLineOfSight = false
	prompt.Parent = chassis
	prompt.Triggered:Connect(function(plr)
		local hum = plr.Character and plr.Character:FindFirstChildOfClass("Humanoid")
		if hum and hum.Health > 0 and not seat.Occupant and not hum.SeatPart then
			seat:Sit(hum)
		end
	end)

	seat:GetPropertyChangedSignal("Occupant"):Connect(function()
		local occ = seat.Occupant
		if occ then
			local plr = Players:GetPlayerFromCharacter(occ.Parent)
			prompt.Enabled = false
			model:SetAttribute("LastUsed", os.clock())
			if plr and chassis:CanSetNetworkOwnership() then
				chassis:SetNetworkOwner(plr)
			end
		else
			prompt.Enabled = true
			model:SetAttribute("LastUsed", os.clock())
			if chassis:CanSetNetworkOwnership() then
				chassis:SetNetworkOwnershipAuto()
			end
		end
	end)

	model:SetAttribute("LastUsed", os.clock())
	model.Parent = carsFolder
	return model, seat
end

-- Coches aparcados (reaparecen si se destruyen o se hunden)
local parked = {}
local function spawnParked(i)
	local spot = Layout.CAR_SPOTS[i]
	local cf = CFrame.new(spot.pos) * CFrame.Angles(0, math.rad(spot.yaw), 0)
	local car = buildCar(cf, CAR_COLORS[rng:NextInteger(1, #CAR_COLORS)], rng:NextNumber() < 0.3)
	car:SetAttribute("SpotIndex", i)
	parked[i] = car
end
for i = 1, #Layout.CAR_SPOTS do
	spawnParked(i)
end

-- Coche personal
local personal = {}
local lastSpawn = {}
SpawnCarRemote.OnServerEvent:Connect(function(plr)
	local now = os.clock()
	if lastSpawn[plr] and now - lastSpawn[plr] < 4 then
		return
	end
	local char = plr.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if not (hum and root and hum.Health > 0) or hum.SeatPart then
		return
	end
	lastSpawn[plr] = now

	if personal[plr] then
		personal[plr]:Destroy()
		personal[plr] = nil
	end

	local look = root.CFrame.LookVector * Vector3.new(1, 0, 1)
	if look.Magnitude < 0.1 then
		look = Vector3.new(0, 0, -1)
	end
	look = look.Unit
	local right = look:Cross(Vector3.yAxis)
	local spot = root.Position + right * 8
	local params = RaycastParams.new()
	params.FilterDescendantsInstances = { char, carsFolder }
	params.FilterType = Enum.RaycastFilterType.Exclude
	local hit = workspace:Raycast(spot + Vector3.new(0, 20, 0), Vector3.new(0, -60, 0), params)
	local groundY = if hit then hit.Position.Y else root.Position.Y - 3
	local cf = CFrame.lookAt(Vector3.new(spot.X, groundY + 0.2, spot.Z), Vector3.new(spot.X, groundY + 0.2, spot.Z) + look)

	local car, seat = buildCar(cf, CAR_COLORS[rng:NextInteger(1, #CAR_COLORS)], rng:NextNumber() < 0.5)
	car.Name = "Coche de " .. plr.DisplayName
	car:SetAttribute("Owner", plr.UserId)
	personal[plr] = car
	task.wait(0.3)
	if hum.Parent and hum.Health > 0 and not seat.Occupant then
		seat:Sit(hum)
	end
end)

Players.PlayerRemoving:Connect(function(plr)
	if personal[plr] then
		personal[plr]:Destroy()
		personal[plr] = nil
	end
	lastSpawn[plr] = nil
end)

-- Limpieza: coches hundidos en el mar y coches abandonados lejos de su sitio
while true do
	task.wait(5)
	for _, car in ipairs(carsFolder:GetChildren()) do
		local chassis = car.PrimaryPart
		local seat = car:FindFirstChild("DriveSeat")
		local sunk = not chassis or chassis.Position.Y < -25
		local idle = seat and not seat.Occupant and os.clock() - (car:GetAttribute("LastUsed") or 0) > 180
		local spotIndex = car:GetAttribute("SpotIndex")
		local moved = false
		if spotIndex and chassis then
			moved = (chassis.Position - Layout.CAR_SPOTS[spotIndex].pos).Magnitude > 30
		end
		if sunk or (idle and (moved or car:GetAttribute("Owner"))) then
			if seat and seat.Occupant then
				seat.Occupant.Sit = false
			end
			car:Destroy()
			if spotIndex and parked[spotIndex] == car then
				spawnParked(spotIndex)
			end
			for plr, c in pairs(personal) do
				if c == car then
					personal[plr] = nil
				end
			end
		end
	end
end
