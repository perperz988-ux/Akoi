-- CarController: conduccion arcade de los coches de Port Solano.
-- Funciona con teclado (WASD / flechas), mando y joystick tactil del movil.
-- El coche "flota" a 0.35 studs sobre el suelo (raycast), asi no se atasca en bordillos.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local player = Players.LocalPlayer

local controls = nil
task.spawn(function()
	local ok, mod = pcall(function()
		return require(player:WaitForChild("PlayerScripts"):WaitForChild("PlayerModule"))
	end)
	if ok and mod then
		controls = mod:GetControls()
	end
end)

local MAX_FWD = 95 -- studs/s (1 stud = 0.5 m -> ~170 km/h)
local MAX_REV = 35
local ACCEL = 32
local BRAKE = 95
local DRAG = 18
local TURN = math.rad(95)
local HOVER = 1.2 -- altura del centro del chasis sobre el suelo

local conn = nil
local current = nil

local function stopDriving()
	if conn then
		conn:Disconnect()
		conn = nil
	end
	if current then
		current.lv.Enabled = false
		current.ao.Enabled = false
		current = nil
	end
	player:SetAttribute("CarSpeed", nil)
end

local function startDriving(seat)
	stopDriving()
	local model = seat.Parent
	local chassis = model and model:FindFirstChild("Chassis")
	local lv = chassis and chassis:FindFirstChild("Drive")
	local ao = chassis and chassis:FindFirstChild("Steer")
	if not (lv and ao) then
		return
	end
	local look = chassis.CFrame.LookVector
	local state = {
		lv = lv,
		ao = ao,
		speed = 0,
		yaw = math.atan2(-look.X, -look.Z),
	}
	current = state

	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.IgnoreWater = false

	lv.Enabled = true
	ao.Enabled = true

	conn = RunService.Heartbeat:Connect(function(dt)
		if not chassis.Parent then
			stopDriving()
			return
		end
		local throttle, steer = 0, 0
		if controls then
			local mv = controls:GetMoveVector()
			throttle, steer = -mv.Z, mv.X
		end
		if math.abs(seat.ThrottleFloat) > math.abs(throttle) then
			throttle = seat.ThrottleFloat
		end
		if math.abs(seat.SteerFloat) > math.abs(steer) then
			steer = seat.SteerFloat
		end

		-- velocidad
		local s = state.speed
		if throttle > 0.05 then
			s = if s < 0 then s + BRAKE * dt else s + ACCEL * throttle * dt
		elseif throttle < -0.05 then
			s = if s > 0 then s - BRAKE * dt else s + ACCEL * throttle * dt
		else
			local d = DRAG * dt
			s = if math.abs(s) <= d then 0 else s - math.sign(s) * d
		end
		s = math.clamp(s, -MAX_REV, MAX_FWD)

		-- si chocamos con algo, la velocidad real manda
		local fwd = CFrame.Angles(0, state.yaw, 0).LookVector
		local actual = chassis.AssemblyLinearVelocity:Dot(fwd)
		if math.abs(s - actual) > 25 then
			s = actual
		end

		-- giro
		local grip = math.clamp(math.abs(s) / 20, 0, 1) * (1 - 0.45 * math.min(math.abs(s) / MAX_FWD, 1))
		state.yaw -= steer * TURN * grip * math.sign(s) * dt

		-- suelo / agua
		params.FilterDescendantsInstances = { model, player.Character }
		local hit = workspace:Raycast(chassis.Position + Vector3.new(0, 2, 0), Vector3.new(0, -2 - HOVER - 4, 0), params)
		local vy, fy = 0, 0
		local mass = chassis.AssemblyMass
		if hit then
			if hit.Instance == workspace.Terrain and hit.Material == Enum.Material.Water then
				s *= 1 - math.min(dt * 2, 1) -- al agua: el coche se hunde
			else
				local target = hit.Position.Y + HOVER
				vy = math.clamp((target - chassis.Position.Y) * 10, -40, 25)
				fy = mass * 400
			end
		end
		state.speed = s

		fwd = CFrame.Angles(0, state.yaw, 0).LookVector
		lv.VectorVelocity = Vector3.new(fwd.X * s, vy, fwd.Z * s)
		lv.MaxAxesForce = Vector3.new(mass * 500, fy, mass * 500)
		ao.CFrame = CFrame.Angles(0, state.yaw, 0)
		player:SetAttribute("CarSpeed", math.abs(s))
	end)
end

local function onCharacter(char)
	stopDriving()
	local hum = char:WaitForChild("Humanoid")
	hum.Seated:Connect(function(active, seat)
		if active and seat and seat:IsA("VehicleSeat") and seat:GetAttribute("PSCar") then
			startDriving(seat)
		else
			stopDriving()
		end
	end)
	hum.Died:Connect(stopDriving)
end

if player.Character then
	task.spawn(onCharacter, player.Character)
end
player.CharacterAdded:Connect(onCharacter)
