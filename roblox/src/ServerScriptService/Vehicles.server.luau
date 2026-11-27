-- Vehicles: fabrica de coches, coches aparcados por el mapa y coche personal
-- (boton "Coche" en pantalla). La conduccion la hace el cliente (CarController)
-- y el servidor le da la propiedad de red del coche mientras conduce.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Layout = require(ReplicatedStorage:WaitForChild("Layout"))
local VehicleModel = require(ReplicatedStorage:WaitForChild("VehicleModel"))
local SC = Layout.SCALE

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

-- coche personal: los deportivos y muscle del original
local PERSONAL_CARS = { "vexa_gt", "kestrel_rs", "marlin_s", "bruiser_70", "stallion_ss", "avanti_lx" }

-- groundCF: CFrame a nivel del suelo; el frente del coche mira a -Z
local function buildCar(groundCF, id, color)
	local visual, d = VehicleModel.build(id, color, groundCF)
	local model = visual
	model.ModelStreamingMode = Enum.ModelStreamingMode.Atomic

	local chassis = Instance.new("Part")
	chassis.Name = "Chassis"
	chassis.Size = Vector3.new(math.max(1.2, d.wid * SC * 0.95), 1.7, d.len * SC * 0.9) -- al conducir flota 0.35 sobre el suelo
	chassis.CFrame = groundCF * CFrame.new(0, 1.1, 0)
	chassis.Transparency = 1
	chassis.CustomPhysicalProperties = PhysicalProperties.new(3, 0.6, 0.1)
	chassis.RootPriority = 10
	chassis.Parent = model
	model.PrimaryPart = chassis
	for _, p in ipairs(model:GetChildren()) do
		if p:IsA("BasePart") and p ~= chassis then
			p.Anchored = false
			p.Massless = true
			local w = Instance.new("WeldConstraint")
			w.Part0 = chassis
			w.Part1 = p
			w.Parent = p
		end
	end
	model:SetAttribute("HP", d.hp)

	-- asiento del conductor, como seatZ en VehicleMesh.ts (frente = -Z)
	local seatZ = -(d.cabin[1] * 0.55 + d.cabin[2] * 0.45) * d.len / 2
	local seat = Instance.new("VehicleSeat")
	seat.Name = "DriveSeat"
	seat.Size = Vector3.new(1.4, 0.4, 1.4)
	seat.CFrame = groundCF * CFrame.new(if d.cls == "bike" then 0 else -d.wid * 0.22 * SC, math.max(0.5, d.beltY * d.hei * 0.55) * SC, seatZ * SC)
	seat.Transparency = 1
	seat.CanCollide = false
	seat.Massless = true
	seat.MaxSpeed = 0
	seat.Torque = 0
	seat.HeadsUpDisplay = false
	seat:SetAttribute("PSCar", true)
	seat:SetAttribute("TopSpeed", d.topSpeed)
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
	local car = buildCar(cf, VehicleModel.randomTrafficId(rng))
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

	local car, seat = buildCar(cf, PERSONAL_CARS[rng:NextInteger(1, #PERSONAL_CARS)])
	car.Name = car.Name .. " (" .. plr.DisplayName .. ")"
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
