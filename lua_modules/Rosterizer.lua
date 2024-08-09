



-- Rosterizer Scripting Functions

local scriptingFunctions




local measuringCircles = {}
local isCurrentlyCheckingCoherency = false
local orthogonalCoherency = 0
local verticalCoherency = 0
local coherencyThreshold = 0
local hasBuiltUI = false
local previousHighlightColor = nil
local MM_TO_INCH = 0.0393701
local MEASURING_RING_Y_OFFSET = 0.17
local VALID_BASE_SIZES_IN_MM = {
    {x = 25, z = 25},
    {x = 28, z = 28},
    {x = 30, z = 30},
    {x = 32, z = 32},
    {x = 40, z = 40},
    {x = 50, z = 50},
    {x = 55, z = 55},
    {x = 60, z = 60},
    {x = 65, z = 65},
    {x = 80, z = 80},
    {x = 90, z = 90},
    {x = 100, z = 100},
    {x = 130, z = 130},
    {x = 160, z = 160},
    {x = 25, z = 75},
    {x = 75, z = 25},
    {x = 35.5, z = 60},
    {x = 60, z = 35.5},
    {x = 40, z = 95},
    {x = 95, z = 40},
    {x = 52, z = 90},
    {x = 90, z = 52},
    {x = 70, z = 105},
    {x = 105, z = 70},
    {x = 92, z = 120},
    {x = 120, z = 92},
    {x = 95, z = 150},
    {x = 150, z = 95},
    {x = 109, z = 170},
    {x = 170, z = 109}
}

local UI_WIDTH = 1200
local BUTTON_COLORS = {
    ["BB22BB"] = "Purple",
    ["2222BB"] = "Blue",
    ["29D9D9"] = "Teal",
    ["22BB22"] = "Green",
    ["DD6633"] = "Orange",
    ["DD77CC"] = "Pink",
    ["FFFFFF"] = "White"
}
local COLOR_ORDER = {"BB22BB", "2222BB", "29D9D9", "22BB22", "DD6633", "DD77CC", "FFFFFF"}

local uiTemplates = {

    -- assetGroup header -->
    assetGroup =  [[<HorizontalLayout class="assetGroupContainer" childForceExpandWidth="false" childForceExpandHeight="false" preferredHeight="\${groupTitleHeight}">
                        <VerticalLayout preferredWidth="\${indentWidth}" />
                        <VerticalLayout class="assetGroupContents">
                            <Text fontStyle="Italic" fontSize="22" color="#\${color}" alignment="MiddleLeft" preferredHeight="\${groupTitleHeight}">\${groupName}</Text>
                        </VerticalLayout>
                    </HorizontalLayout>]],

    -- Repeating Section for Each Asset -->
    asset =   [[<HorizontalLayout class="assetContainer" childForceExpandWidth="false" childForceExpandHeight="false" preferredHeight="\${assetHeight}">
                    <VerticalLayout preferredWidth="\${indentWidth}" />
                    <VerticalLayout preferredWidth="\${assetWidth}" color="#444444" padding="5 5 5 5" childForceExpandHeight="false" childForceExpandWidtht="false">\${assetName}\${assetContents}</VerticalLayout>
                </HorizontalLayout>]],
    assetName = [[<Text fontStyle="\${assetNameStyle}" fontSize="22" color="#\${assetNameColor}" alignment="MiddleLeft" preferredHeight="40">\${assetName}</Text>]],

    -- Keyword Section for the Asset -->
    keywordSection = [[<VerticalLayout class="keywordContainer" childForceExpandHeight="false">\${keyCats}</VerticalLayout>]],
    -- Repeatable Keyword Category -->
    keyCat =  [[<HorizontalLayout childForceExpandWidth="false" childForceExpandHeight="true" childAlignment="MiddleLeft" class="keywordList" spacing="3" preferredHeight="35">
                    <Text fontSize="16" color="#cccccc" alignment="MiddleRight" preferredWidth="100" class="keywordCategory" resizeTextForBestFit="true" resizeTextMinSize="6" resizeTextMaxSize="16">\${keyCatName}:</Text>
                    <Text fontSize="18" color="#fafafa" resizeTextForBestFit="true" resizeTextMinSize="6" resizeTextMaxSize="18" fontStyle="Italic" class="keywords" horizontalOverflow="Wrap" flexibleHeight="1" alignment="MiddleLeft">\${keyList}</Text>
                </HorizontalLayout>]],

    -- Stat Table for the Asset -->
    statTable =   [[<VerticalLayout class="statTable" preferredHeight="170" padding="0 5 0 5">
                        <TableLayout cellPadding="5" childForceExpandHeight="false" autoCalculateHeight="true" horizontalOverflow="Wrap" columnWidths="auto">
                            \${statRows}
                        </TableLayout>
                    </VerticalLayout>]],
    statHeaderRow = [[<Row color="#222222" preferredHeight="40" dontUseTableRowBackground="true">\${statNames}</Row>]],
    statValueRow =  [[<Row color="#333333" dontUseTableRowBackground="true" preferredHeight="60">\${statValues}</Row>]],
    -- Repeating Section for Each Stat -->
    statCell =      [[<Cell><Text fontStyle="Bold" fontSize="18" color="#\${color}" alignment="MiddleCenter" resizeTextForBestFit="true" resizeTextMinSize="6" resizeTextMaxSize="20">\${statContents}</Text></Cell>]],

    -- Text Section for the Asset -->
    textBlock =   [[<VerticalLayout childForceExpandWidth="false" preferredHeight="\${textHeight}">
                        <Text fontSize="18" resizeTextForBestFit="true" resizeTextMinSize="10" resizeTextMaxSize="18" color="#fafafa" class="assetText" alignment="MiddleLeft" preferredHeight="\${textHeight}">\${text}</Text>
                    </VerticalLayout>]],
    descBlock =   [[<VerticalLayout childForceExpandWidth="false" preferredHeight="\${descriptionHeight}">
                        <Text fontSize="18" color="#fafafa" class="assetLabel" alignment="MiddleLeft" preferredHeight="40">Description:</Text>
                        <Text fontSize="18" resizeTextForBestFit="true" resizeTextMinSize="10" resizeTextMaxSize="18" color="#fafafa" class="assetText" alignment="MiddleLeft" preferredHeight="\${textHeight}">\${text}</Text>
                    </VerticalLayout>]],
    
    -- Attribution/info line
    attribution = [[<HorizontalLayout childForceExpandWidth="false" color="#333333" childForceExpandHeight="false" preferredHeight="40">
                        <Text fontSize="18" color="#ffaa00" class="assetText" alignment="MiddleLeft" preferredHeight="40" preferredWidth="400">Created with Rosterizer™</Text>
                        <Text fontSize="18" color="#fafafa" class="assetText" alignment="MiddleCenter" preferredHeight="40" preferredWidth="400">\${game} \${edition} \${rulebook} (\${version})</Text>
                        <Text fontSize="18" color="#fafafa" class="assetText" alignment="MiddleRight" preferredHeight="40" preferredWidth="400">\${hash}</Text>
                    </HorizontalLayout>]],

    -- Button Section for the Asset -->
    -- this is here and not in xml because we have to provide the guid, otherwise it will try and run on Global
    highlightButton = [[<Button padding="3 3 3 3" preferredHeight="20" preferredWidth="\${width}" color="#\${colorValue}" onClick="\${guid}/highlightGroup(\${colorName})"></Button>]],
    unhighlightButton = [[<Button padding="3 3 3 3" preferredHeight="20" preferredWidth="\${width}" color="#BBBBBB" onClick="\${guid}/unhighlightGroup"></Button>]]
}


--[[ SCRIPTING FUNCTION DEFINITIONS ]]--


function none() end


function changeModelWoundCount(mod, target)
    local name = target.getName()
    local _,_, current, total = name:find("]([0-9]+)/([0-9]+)")
    local colors,newName,currentBracket,updatedName,currentColor

    if current == nil then return end

    current = math.max(tonumber(current) + mod, 0)
    total = tonumber(total)
    newName = string.gsub(name, "]([0-9]+)/([0-9]+)", "]"..current.."/"..total, 1)

    currentColor = getHitPointColor(current, total)

    updatedName = string.gsub(newName, "%[%w+]", "["..currentColor.."]", 1)

    target.setName(updatedName)
end

function getHitPointColor(current, total)
    local bloodedThreshold = math.floor(total / 2)

    if current > total then
        return "00ffff" -- Super
    elseif current == total then
        return "00ff33" -- Healthy
    elseif current > bloodedThreshold then
        return "bbff00" -- Injured
    elseif current == bloodedThreshold and total > 1 then
        return "ffee00" -- Blooded
    elseif current > 0 then
        return "ffaa00" -- Critical
    else
        return "ff0000" -- Dead
    end
end

function toggleRectangularMeasuring(playerColor, target)
    local isRectangular = target.hasTag("rectangularMeasuring")

    if not isRectangular then
        target.addTag("rectangularMeasuring")
        broadcastToAll("Model set to rectangular measuring")
    else
        target.removeTag("rectangularMeasuring")
        broadcastToAll("Model set to round measuring")
    end

    changeMeasurementCircle(0, target)
end


--[[ EVENT HANDLERS ]]--


function onLoad(savedState)
    if not self.hasTag("leaderModel") then return end -- prevents firing on objects we don't want firing

    local hasLoaded = self.getVar("hasLoaded")
    if hasLoaded == nil or not hasLoaded then
        local decodedState = savedState == nil and nil or JSON.decode(savedState)

        if decodedState ~= nil and loadDecodedState ~= nil then
            loadDecodedState(decodedState)
        elseif loadDefaultValues ~= nil then
            loadDefaultValues()
        end

        setContextMenuItemsForGroup()

        --Wait.frames(function () buildUI() end, 2)
        if groupData.meta ~= nil and groupData.meta.ttsCoherency ~= nil then
            -- if coherency has a comma, split it up and assign to orthogonal and vertical
            if groupData.meta.ttsCoherency:find(",") then
                local coherency = mysplit(groupData.meta.ttsCoherency,",")
                orthogonalCoherency = tonumber(coherency[1]) or 999
                verticalCoherency = tonumber(coherency[2]) or 999
                coherencyThreshold = tonumber(coherency[3]) or 999
            else
                orthogonalCoherency = tonumber(groupData.meta.ttsCoherency) or 999
                verticalCoherency = tonumber(groupData.meta.ttsCoherency) or 999
                coherencyThreshold = 999
            end
            Wait.frames(function ()
                toggleCoherencyChecking(playerColor)
            end, 1)
        end
    else
        local newUUID = randomString(8)
        for _,model in ipairs(getObjectsWithTag("uuid:"..groupData.uuid)) do
            model.removeTag("uuid:"..groupData.uuid)
            model.addTag("uuid:"..newUUID)
            model.setVar("hasLoaded", true)
        end
        groupData.uuid = newUUID
    end
end


function onScriptingButtonDown(index, playerColor)
    if not self.hasTag("leaderModel") then return end -- prevents firing on objects we don't want firing

    local player = Player[playerColor]
    local hoveredObject = player.getHoverObject()

    -- if the hovered object has a matching groupID, then it is part of this model's group and thus is a valid target
    local isHoveringValidTarget = hoveredObject ~= nil and hoveredObject.hasTag("uuid:"..groupData.uuid)

    if isHoveringValidTarget then scriptingFunctions[index](playerColor, hoveredObject, player) end
end


function onObjectDrop(playerColor, droppedObject)
    if not self.hasTag("leaderModel") then return end -- prevents firing on objects we don't want firing
    if isCurrentlyCheckingCoherency and
        droppedObject ~= nil and
        groupData ~= nil and
        droppedObject.hasTag("uuid:"..groupData.uuid) then
            Wait.frames(function ()
                droppedObject.setLock(true)
                -- wait a frame for locking to cancel momentum
                Wait.frames(function ()
                    droppedObject.setLock(false)
                    highlightCoherency()
                end, 2)
            end, 5)
    end
end


function onObjectRotate(object, spin, flip, playerColor, oldSpin, oldFlip)
    if not self.hasTag("leaderModel") then return end -- prevents firing on objects we don't want firing
    if isCurrentlyCheckingCoherency and
        flip ~= oldFlip and  -- update on model flip
        object.hasTag("uuid:"..groupData.uuid) then
        -- wait for a bit, otherwise the model will still be considered face down when its flipped face up and vice versa
        Wait.time(|| highlightCoherency(), 0.3)
    end
end


function onPlayerAction(player, action, targets)
    if not self.hasTag("leaderModel") then return end -- prevents firing on objects we don't want firing
    if action == Player.Action.Paste then
        local groupTag = "uuid:"..groupData.uuid
        for _,object in ipairs(targets) do
            if object.hasTag(groupTag) and object.hasTag("leaderModel") then
                object.setLuaScript("")
                object.removeTag("leaderModel")
            end
        end
    elseif action == Player.Action.Delete then
        local groupTag = "uuid:"..groupData.uuid
        for _,object in ipairs(targets) do
            if object == self then
                local modelsInGroup = getObjectsWithTag(groupTag)
                local modelsInGroupNotBeingDeleted = filter(modelsInGroup, |model| not includes(targets, model))
                if #modelsInGroupNotBeingDeleted >= 1 then
                    local newLeader = modelsInGroupNotBeingDeleted[1]
                    updateEventHandlers(newLeader.getGUID())

                    Wait.frames(function ()
                        newLeader.setLuaScript(self.getLuaScript())
                        newLeader.UI.setXml(self.UI.getXml())
                        newLeader.addTag("leaderModel")
                    end, 2)

                    self.removeTag("leaderModel")

                end
            end
        end
    end
end

function onObjectSpawn(object)
    if not self.hasTag("leaderModel") then return end -- prevents firing on objects we don't want firing

    if object ~= self and object.hasTag("leaderModel") and object.hasTag("uuid:"..groupData.uuid) then
        object.removeTag("leaderModel")
        object.setLuaScript("")
        --[[ local groupModels = getObjectsWithTag("uuid:"..groupData.uuid)

        for _,model in ipairs(groupModels) do
            if model ~= object and model.hasTag("leaderModel") then
                object.removeTag("leaderModel")
                object.setLuaScript("")
                break
            end
        end --]]
    end
end








--[[ UI UTILITY FUNCTIONS ]]--

--[[ function returning a random alphanumeric string of length k --]]
function randomString(k)
    local alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    local n = string.len(alphabet)
    local pw = {}
    for i = 1, k
    do
        pw[i] = string.byte(alphabet, math.random(n))
    end
    return string.char(table.unpack(pw))
end

--[[ function to split a string into a table --]]
function mysplit (inputstr, sep)
    if sep == nil then
       sep = "%s"
    end
    local t={}
    for str in string.gmatch(inputstr, "([^"..sep.."]+)") do
       table.insert(t, str)
    end
    return t
end

--[[ function to get the next color in the table --]]
function getNextColor(colorName)
    local currentIndex = 0
    for i, key in ipairs(COLOR_ORDER) do
        if colorName == BUTTON_COLORS[key] then
            currentIndex = i
            break
        end
    end
    
    if currentIndex == 0 then
        return BUTTON_COLORS[COLOR_ORDER[1]]
    elseif currentIndex == #COLOR_ORDER then
        return nil
    else
        return BUTTON_COLORS[COLOR_ORDER[currentIndex + 1]]
    end
end

function showCard(cardName, playerColor)
    local timeToWait = 0

    if not hasBuiltUI then
        buildUI()
        hasBuiltUI = true
        timeToWait = 2
    end

    -- wait in case ui needs to update
    Wait.frames(function ()
        local globalUI = Global.UI.getXmlTable()
        local selfUI = self.UI.getXmlTable()
        local formattedCardName = "ymc-"..cardName.."-"..groupData.uuid.."-"..playerColor
        local shownYet = false

        -- yes, I know we go through the table twice, I don't like it
        for _,element in ipairs(globalUI) do

            if element.attributes.id == formattedCardName then
                shownYet = true

                if element.attributes.visibility ~= playerColor or not element.attributes.active then
                    element.attributes.visibility = playerColor
                    element.attributes.active = true
                end
            end
        end

        if not shownYet then
            local cardToShow = filter(selfUI[1].children, |child| child.attributes.id == cardName)[1]
            cardToShow.attributes.id = formattedCardName
            cardToShow.attributes.visibility = playerColor
            cardToShow.attributes.active = true

            table.insert(globalUI, cardToShow)
        end

        Global.UI.setXmlTable(globalUI)
    end, timeToWait)
end


function hideCard(player, card)
    -- broadcastToAll("Hiding "..card)
    local playerColor = player.color

    if (player.color:find("^%w+$")) == nil then playerColor = "Grey" end

    local formattedCardName = "ymc-"..card.."-"..groupData.uuid.."-"..playerColor
    -- broadcastToAll("Hiding "..formattedCardName)

    Global.UI.setAttribute(formattedCardName, "visibility", "None")
    Global.UI.setAttribute(formattedCardName, "active", false)

    Wait.time(function()
        local currentUI = UI.getXmlTable()
        local foundVisibleCard = false

        for _,element in ipairs(currentUI) do
            if element.attributes ~= nil and
                element.attributes.id ~= nil and
                (element.attributes.id:find("^ymc-")) ~= nil and -- if we find a card
                element.attributes.visibility ~= nil and
                element.attributes.visibility ~= "" and
                element.attributes.visibility ~= "None" then
                    foundVisibleCard = true
                    break
            end

        end

        if not foundVisibleCard then return end

        currentUI = filter(currentUI, |element| element.attributes.id == nil or (element.attributes.id:find("^ymc-")) == nil)

        Global.UI.setXmlTable(currentUI)
    end, 0.11)
end

local dataCardHeight = 0
function buildUI()
    self.UI.setAttribute("ym-container", "group-id", groupData.uuid)

    self.UI.setValue("data-groupName", groupData.groupName)

    -- Iterate through the flat assets array and process each asset
    local populatedSection = ""
    for i, asset in ipairs(groupData.groupAsset.assets) do
        -- Populate the template based on the asset data
        populatedSection = populatedSection .. populateTemplate(asset,i)

    end
    -- Populate the attribution line
    populatedSection = populatedSection .. interpolate(uiTemplates.attribution, { game = groupData.game, edition = groupData.edition, rulebook = groupData.rulebook, version = groupData.version, hash = groupData.hash })
    dataCardHeight = dataCardHeight + 40
    -- Insert the populated section into dataCardContentContainer
    self.UI.setValue("dataCardContentContainer", populatedSection)
    self.UI.setAttribute("dataCardContentContainer", "height", dataCardHeight)

    local guid = self.getGUID()
    -- broadcastToAll("GUID: "..guid)

    self.UI.setAttribute("dataCardCloseButton", "onClick", guid.."/hideCard(dataCard)")
    
    -- Populate the highlight buttons
    local buttonXml = ""
    for colorValue, colorName in pairs(BUTTON_COLORS) do
        buttonXml = buttonXml..interpolate(uiTemplates.highlightButton, { colorName = colorName, colorValue = colorValue, guid = guid, width=(UI_WIDTH/(#BUTTON_COLORS + 1))-4 })
    end
    buttonXml = buttonXml..interpolate(uiTemplates.unhighlightButton, { guid = guid, width=(UI_WIDTH/(#BUTTON_COLORS + 1))-4 })
    self.UI.setValue("highlightButtonsContainer", buttonXml)

end

function populateTemplate(asset,i)
    local template = ""
    local assetHeight = 0
    
    if asset.group != nil then
        -- Populate the asset group header
        -- Convert asset group name to lowercase for case-insensitive comparison
        local assetGroup = string.lower(asset.group)

        -- Check if the lowercase asset group name contains one of the keywords
        local color = ""
        if assetGroup:find("combat") or assetGroup:find("attack") or assetGroup:find("weapon") then
            color = "ff6666"
        else
            color = "ccaaff"
        end
        assetHeight = assetHeight + 40
        template = template..interpolate(uiTemplates.assetGroup, { indentWidth = asset.assetDepth * 50, color = color, groupTitleHeight = assetHeight, groupName = asset.group })
    else
        local assetContents = ""
        -- Populate the keywords in categories
        -- Loop through the categories and generate the keyword section
        if asset.keywords and next(asset.keywords) then
            local keyCats = ""
            for keyCatName, keywords in pairs(asset.keywords) do
                local keyList = ""
                for _, keyword in ipairs(keywords) do
                    keyList = keyList .. keyword .. ", "
                end
                keyList = keyList:sub(1, -3) -- Remove the trailing comma and space
                local keyCat = interpolate(uiTemplates.keyCat, { keyCatName = string.upper(keyCatName), keyList = keyList })
                assetHeight = assetHeight + 25
                keyCats = keyCats .. keyCat
            end
            assetContents = assetContents .. interpolate(uiTemplates.keywordSection, { keyCats = keyCats })
        end
        
        -- Populate the stats table
        if asset.stats and next(asset.stats) then
            -- Create cells for each stat name
            local statNameCells = ""
            local statValueCells = ""
            for statName, statValue in pairs(asset.stats) do
                statNameCells = statNameCells .. interpolate(uiTemplates.statCell, { statContents = statName, color = "cccccc" })
                statValueCells = statValueCells .. interpolate(uiTemplates.statCell, { statContents = statValue, color = "ffaa00" })
            end

            -- Interpolate statNameCells into statHeaderRow
            local statHeaderRow = interpolate(uiTemplates.statHeaderRow, { statNames = statNameCells })

            -- Interpolate statValueCells into statValueRow
            local statValueRow = interpolate(uiTemplates.statValueRow, { statValues = statValueCells })

            -- Combine statHeaderRow and statValueRow into statTable
            assetContents = assetContents .. interpolate(uiTemplates.statTable, { statRows = statHeaderRow .. statValueRow })
            assetHeight = assetHeight + 170
        end
        
        -- Populate the text block for description and asset text
        if asset.text != "" then
            -- get text length and use to approximate text height
            local textLength = (math.ceil(asset.text:len() / 140) * 30)
            assetContents = assetContents .. interpolate(uiTemplates.textBlock, { label = "Text", text = asset.text, textHeight = textLength })
            assetHeight = assetHeight + textLength
        end
        if asset.description != "" then
            -- get description length and use to approximate description height
            local descriptionLength = (math.ceil(asset.description:len() / 140) * 30)
            assetContents = assetContents .. interpolate(uiTemplates.descBlock, { label = "Description", text = asset.description, textHeight = descriptionLength, descriptionHeight = (descriptionLength + 40) })
            assetHeight = assetHeight + descriptionLength
        end

        -- put it all together
        local assetName = ""
        if i != 1 or asset.quantity > 1 then
            local assetNameFormat = asset.name
            if asset.quantity > 1 then
                assetNameFormat = asset.quantity .. "× " .. assetNameFormat
            end
            assetHeight = assetHeight + 75
            local assetNameColor = "fafafa"
            local fontStyle = "Bold"
            -- if no asset stats AND the next asset (if it exists) is not a lower assetDepth, use 88ccaa
            if (asset.stats == nil or not next(asset.stats)) and (groupData.groupAsset.assets[i+1] == nil or asset.assetDepth >= groupData.groupAsset.assets[i+1].assetDepth) then
                assetNameColor = "88ccaa"
                fontStyle = "Normal"
            end
            assetName = interpolate(uiTemplates.assetName, { assetName = assetNameFormat, assetNameColor = assetNameColor, assetNameStyle = fontStyle })
        end
        template = interpolate(uiTemplates.asset, { indentWidth = asset.assetDepth * 50, assetWidth = (1160 - (asset.assetDepth * 50)), assetName = assetName, assetNameColor = assetNameColor, fontStyle = fontStyle, assetHeight = assetHeight, assetContents = assetContents })
    end
    dataCardHeight = dataCardHeight + assetHeight
    
    return template
end

function setContextMenuItemsForGroup()
    local hasLoaded = self.getVar("hasLoaded")
    if hasLoaded == nil or not hasLoaded then
        local group = getObjectsWithTag("uuid:"..groupData.uuid)
        local isSingleModel = groupData.gamePieces == nil

        if not isSingleModel and #group > 1 then
            for _,model in ipairs(group) do
                model.addContextMenuItem("Toggle Coherency ✓", toggleCoherencyChecking)
            end
        end
    end
end

function updateEventHandlers(guid)
    self.UI.setAttribute("dataCardCloseButton", "onClick", guid.."/hideCard(dataCard)")
    Global.UI.setAttribute("dataCardCloseButton", "onClick", guid.."/hideCard(dataCard)")
    -- local newButtonXml = interpolate(uiTemplates.highlightButton, { guid=guid, width=(UI_WIDTH/(#BUTTON_COLORS + 1))-4 })
    -- local buttonXml = ""
    -- for colorName, colorValue in pairs(BUTTON_COLORS) do
    --     buttonXml = buttonXml..interpolate(uiTemplates.highlightButton, { colorName = colorName, colorValue = colorValue, guid = guid, width=(UI_WIDTH/(#BUTTON_COLORS + 1))-4 })
    -- end
    -- buttonXml = buttonXml..interpolate(uiTemplates.unhighlightButton, { guid = guid, width=(UI_WIDTH/(#BUTTON_COLORS + 1))-4 })
    -- self.UI.setValue("highlightButtonsContainer", buttonXml)
end

--[[ HIGHLIGHTING FUNCTIONS ]]--


function highlightGroup(player, color)
    for _,model in pairs(getObjectsWithTag("uuid:"..groupData.uuid)) do
        model.highlightOn(color)
        model.setVar("currentHighlightColor", color)
    end
end

function unhighlightGroup()
    for _,model in pairs(getObjectsWithTag("uuid:"..groupData.uuid)) do
        model.highlightOff()
        model.setVar("currentHighlightColor", nil)
    end
end






--[[ GROUP COHERENCY FUNCTIONS ]]--

function toggleCoherencyChecking(playerColor)
    isCurrentlyCheckingCoherency = not isCurrentlyCheckingCoherency

    if isCurrentlyCheckingCoherency then
        highlightCoherency()
        if playerColor ~= nil then
            broadcastToColor("Checking coherency for "..groupData.groupName, playerColor, playerColor)
        end
    else
        local oldHighlight = self.getVar("currentHighlightColor")

        if oldHighlight == nil then
            unhighlightGroup()
        else
            highlightGroup(nil, oldHighlight)
        end

        broadcastToColor("No longer checking coherency for "..groupData.groupName, playerColor, playerColor)
    end
end

function highlightCoherency()
    local modelsInGroup = getObjectsWithTag("uuid:"..groupData.uuid)
    local filteredGroups = {}

    for _,model in ipairs(modelsInGroup) do
        if model.is_face_down then -- ignore face-down models
            model.highlightOff()
        else
            table.insert(filteredGroups, model)
        end
    end

    local coherencyCheckNum = (#filteredGroups > coherencyThreshold) and 2 or 1
    local coherencyGroups = getCoherencyGroups(filteredGroups, coherencyCheckNum)
    local numberOfBlobs = len(coherencyGroups)
    local oldHighlight = self.getVar("currentHighlightColor")

    if numberOfBlobs == 0 then return
    elseif numberOfBlobs > 1 then
        for _,blob in ipairs(coherencyGroups) do
            for modelIdx,_ in pairs(blob) do
                filteredGroups[modelIdx].highlightOff()
                filteredGroups[modelIdx].highlightOn("Yellow")
            end
        end
    else
        -- don't just highlight all the models in the group, there might be other models
        -- that were purely outside of coherency (and thus not in a blob)
        for modelIdx,_ in pairs(coherencyGroups[1]) do
            filteredGroups[modelIdx].highlightOff()
            if oldHighlight ~= nil then
                filteredGroups[modelIdx].highlightOn(oldHighlight)
            end
        end
    end
end

function getCoherencyGroups(modelsToSearch, numberToLookFor)
    local edges = getCoherencyGraph(modelsToSearch)
    local blobs = {}
    local modelsToIgnore = {}

    for idx,model in ipairs(modelsToSearch) do
        if edges[idx] == nil or #edges[idx] < numberToLookFor then -- the model is out of coherency
            model.highlightOff()
            model.highlightOn("Red")

            modelsToIgnore[idx] = true
            -- remove from any blobs the model is already in
            for _,blob in ipairs(blobs) do
                blob[idx] = nil
            end
        else
            local found = false
            -- see if this index exists in a blob, if it does, ignore it
            for _,blob in ipairs(blobs) do
                if blob[idx] == true then
                    found = true
                    break
                end
            end

            if not found then
                local newBlob = {}

                table.insert(blobs, newBlob)
                addModelsToBlobRecursive(idx, newBlob, edges, modelsToIgnore)
            end
        end
    end

    return blobs
end

function getCoherencyGraph(modelsToSearch)
    local edges = {}

    for idx=1,#modelsToSearch do
        for otherIdx=idx+1,#modelsToSearch do
            local firstPosition = modelsToSearch[idx].getPosition()
            local firstSize = determineBaseInInches(modelsToSearch[idx])
            local secondPosition = modelsToSearch[otherIdx].getPosition()
            local secondSize = determineBaseInInches(modelsToSearch[otherIdx])
            local verticalDisplacement = distanceBetweenVertical(firstPosition, secondPosition)

            -- handle circular bases
            if firstSize.x == firstSize.z and secondSize.x == secondSize.z then
                if distanceBetween2D(firstPosition, firstSize.x, secondPosition, secondSize.x) <= orthogonalCoherency and
                    verticalDisplacement <= verticalCoherency then
                    -- store all edges of a graph where models are nodes and edges represent coherency
                    storeEdges(edges, idx, otherIdx)
                end
            else -- handle non-circular bases
                if firstSize.x ~= firstSize.z and secondSize.x ~= secondSize.z then -- handle two ovals
                    -- if the bases were circles with radiuses = minor axes and they are in coherency,
                    -- the ovals must be in coherency
                    if distanceBetween2D(firstPosition, math.min(firstSize.x, firstSize.z), secondPosition, math.min(secondSize.x, secondSize.z)) <= orthogonalCoherency and
                        verticalDisplacement <= verticalCoherency then
                        -- store edges in graph
                        storeEdges(edges, idx, otherIdx)

                    -- if the bases were circles with radiuses = major axes and they are out of coherency,
                    -- there is no way for the ovals to be in coherency
                    elseif not (distanceBetween2D(firstPosition, math.max(firstSize.x, firstSize.z), secondPosition, math.max(secondSize.x, secondSize.z)) > orthogonalCoherency or
                                verticalDisplacement > verticalCoherency) then
                        -- only way to get here is if coherency is uncertain, so now check a little more precisely (only a little)
                        if distanceBetween2D(firstPosition, (firstSize.x+firstSize.z)/2, secondPosition, (secondSize.x+secondSize.z)/2) <= orthogonalCoherency and
                            verticalDisplacement <= verticalCoherency then
                            storeEdges(edges, idx, otherIdx)
                        end
                    end
                else -- handle one circle and one oval
                    local oval,ovalPosition,circle,circlePosition

                    if firstSize.x ~= firstSize.z then
                        oval = firstSize
                        ovalPosition = firstPosition
                        circle = secondSize
                        circlePosition = secondPosition
                    else
                        oval = secondSize
                        ovalPosition = secondPosition
                        circle = firstSize
                        circlePosition = firstPosition
                    end

                    -- if the oval base was a circle with radius = minor axis and they are in coherency,
                    -- the models must be in coherency
                    if distanceBetween2D(circlePosition, circle.x, ovalPosition, math.min(oval.x, oval.z)) <= orthogonalCoherency and
                        verticalDisplacement <= verticalCoherency then
                        storeEdges(edges, idx, otherIdx)

                    -- if the oval base was a circle with radius = major axis and they are out of coherency,
                    -- there is no way for the models to be in coherency
                    elseif not (distanceBetween2D(circlePosition, circle.x, ovalPosition, math.max(oval.x, oval.z)) > orthogonalCoherency or
                                verticalDisplacement > verticalCoherency) then
                        -- only way to get here is if coherency is uncertain, so now check a little more precisely (only a little)
                        if distanceBetween2D(circlePosition, circle.x, ovalPosition, (oval.x+oval.z)/2) <= orthogonalCoherency and
                            verticalDisplacement <= verticalCoherency then
                            storeEdges(edges, idx, otherIdx)
                        end
                    end
                end
            end
        end
    end

    return edges
end

function storeEdges(edges, idx, otherIdx)
    if edges[idx] == nil then edges[idx] = { otherIdx }
    else table.insert(edges[idx], otherIdx) end

    if edges[otherIdx] == nil then edges[otherIdx] = { idx }
    else table.insert(edges[otherIdx], idx) end
end

function addModelsToBlobRecursive(idx, blob, edges, modelsToIgnore)
    -- at this point, idx should not exist in any blobs
    if modelsToIgnore[idx] ~= nil then return end
    if blob[idx] ~= nil then return end

    blob[idx] = true

    for _,edge in ipairs(edges[idx]) do
        addModelsToBlobRecursive(edge, blob, edges, modelsToIgnore)
    end
end








--[[ UTILITY FUNCTIONS ]]--


function interpolate(templateString, replacementValues)
    return (templateString:gsub('($%b{})', function(w) return replacementValues[w:sub(3, -2)] or w end))
end


function isInList(key, list)
    for _,k in pairs(list) do
        if k == key then return true end
    end
    return false
end

function len(t)
    local count = 0

    for _,_ in pairs(t) do
        count = count + 1
    end

    return count
end

function distanceBetween2D(firstModelPosition, firstModelRadius, secondModelPosition, secondModelRadius)
    -- generally should only be checking coherency with circular bases?
    return getRawDistance(firstModelPosition.x, firstModelPosition.z,
                secondModelPosition.x, secondModelPosition.z) - firstModelRadius - secondModelRadius
end

function distanceBetweenVertical(firstModelPosition, secondModelPosition)
    -- vertical measuring assumes the model has a base because generally vehicles (or models without bases)
    -- dont need to check coherency, and the ones that do probably wont be out of vertical coherency
    -- because they cant end up on upper floors of buildings or walls
    return math.abs(firstModelPosition.y - secondModelPosition.y) - 0.2 -- this is assuming the model has a base
end

function getRawDistance(firstA, firstB, secondA, secondB)
    return math.sqrt(
        math.pow(firstA - secondA, 2) +
        math.pow(firstB - secondB, 2)
    )
end

function includes(tab, val)
    return find(tab, val) > 0
end

function find(tab, val)
    for index, value in ipairs(tab) do
        if value == val then
            return index
        end
    end

    return -1
end

function filter(t, filterFunc)
    local out = {}

    for k, v in pairs(t) do
      if filterFunc(v, k, t) then table.insert(out,v) end
    end

    return out
end

function clone(orig)
    local orig_type = type(orig)
    local copy
    if orig_type == 'table' then
        copy = {}
        for orig_key, orig_value in next, orig, nil do
            copy[clone(orig_key)] = clone(orig_value)
        end
        setmetatable(copy, clone(getmetatable(orig)))
    else -- number, string, boolean, etc
        copy = orig
    end
    return copy
end

function map(t, mapFunc)
    local out = {}

    for k,v in pairs(clone(t)) do
        table.insert(out, mapFunc(v,k))
    end

    return out
end


function getGroupData() -- allow external TTS mods to access yellowscribe information
    return groupData
end


function incrementColor(target)
    local currentColor = target.getVar("currentHighlightColor")
    local nextColor = getNextColor(currentColor)

    if nextColor ~= nil then
        highlightGroup(nil, nextColor)
    else
        unhighlightGroup()
    end
end


--[[ MEASURING CIRCLE FUNCTIONS ]]--


function assignBase(inc, target)
    local savedBase = target.getTable("chosenBase")

    if savedBase == nil then
        changeMeasurementCircle(0, target, determineBaseInInches(target))
    else
        local newIdx = savedBase.baseIdx + inc

        if newIdx < 1 then newIdx = #VALID_BASE_SIZES_IN_MM end
        if newIdx > #VALID_BASE_SIZES_IN_MM then newIdx = 1 end

        local newBase = {
            baseIdx = newIdx,
            base = {
                x = (VALID_BASE_SIZES_IN_MM[newIdx].x * MM_TO_INCH)/2,
                z = (VALID_BASE_SIZES_IN_MM[newIdx].z * MM_TO_INCH)/2
            }
        }

        target.setTable("chosenBase", newBase)

        changeMeasurementCircle(0, target, newBase.base)
    end
end


function determineBaseInInches(model)
    local savedBase = model.getTable("chosenBase")

    if savedBase ~= nil then
        return savedBase.base
    else
        local chosenBase =  VALID_BASE_SIZES_IN_MM[1]
        local modelSize = model.getBoundsNormalized().size
        local modelSizeX = modelSize.x
        local modelSizeZ = modelSize.z
        local closestSum = 10000000000
        local chosenBaseIdx = 1

        for k, base in pairs(VALID_BASE_SIZES_IN_MM) do
            local baseInchX = (MM_TO_INCH - 0.001) * base.x
            local baseInchZ = (MM_TO_INCH - 0.001) * base.z
            if modelSizeX > baseInchX and modelSizeZ > baseInchZ then
                local distSum = (modelSizeX - baseInchX) + (modelSizeZ - baseInchZ)
                if distSum < closestSum then
                    closestSum = distSum
                    chosenBase = base
                    chosenBaseIdx = k
                end
            end
        end

        if chosenBase == nil then
            chosenBase = { x=modelSizeX/2, z=modelSizeZ/2}
        else
            chosenBase = {
                x = (chosenBase.x * MM_TO_INCH)/2,
                z = (chosenBase.z * MM_TO_INCH)/2
            }
        end

        model.setTable("chosenBase", { baseIdx=chosenBaseIdx, base=chosenBase })

        return chosenBase
    end
end


function changeMeasurementCircle(change, target, presetBase)
    local measuringRings = target.getTable("ym-measuring-circles")
    local currentColor = target.getVar("currentHighlightColor")
    local currentColorRadius

    if measuringRings == nil then
        measuringRings = {}
        currentColorRadius = 0
    else
        for idx=#measuringRings,1,-1 do
            if (measuringRings[idx].name == currentColor) or (measuringRings[idx].name == nil and currentColor == nil) then
                currentColorRadius = measuringRings[idx].radius
                table.remove(measuringRings, idx)
            elseif measuringRings[idx].name == "base" then
                table.remove(measuringRings, idx)
            end
        end

        if currentColorRadius == nil then currentColorRadius = 0 end
    end

    local newRadius = math.max(currentColorRadius + change, 0)

    if newRadius == 0 then

    else

        local isRectangular = target.hasTag("rectangularMeasuring")
        local measuring = {
            name = currentColor,
            color = currentColor == nil and {1,0,1} or Color.fromString(currentColor),
            radius = newRadius,
            thickness = 0.1 * 1/(target.getScale().x),
            rotation  = {270,0,0}--isRectangular and {0,0,0} or {270,0,0}
        }
        local base = {
            name="base",
            color = currentColor == nil and {1,0,1} or Color.fromString(currentColor),
            thickness = 0.1 * 1/(target.getScale().x),
            rotation  = {270,0,0}--isRectangular and {0,0,0} or {270,0,0}
        }
        local measuringPoints,basePoints

        if isRectangular then
            local modelBounds = target.getBoundsNormalized()

            if newRadius > 0 then
                measuringPoints = getRectangleVectorPoints(newRadius, modelBounds.size.x/2, modelBounds.size.z/2, target)
                basePoints = getRectangleVectorPoints(0, modelBounds.size.x/2, modelBounds.size.z/2, target)
            end
        else
            local baseRadiuses = (presetBase == nil) and determineBaseInInches(target) or presetBase

            if newRadius > 0 then
                measuringPoints = getCircleVectorPoints(newRadius, baseRadiuses.x, baseRadiuses.z, target)
                basePoints = getCircleVectorPoints(0, baseRadiuses.x, baseRadiuses.z, target)
            end
        end

        measuring.points = measuringPoints
        base.points = basePoints

        table.insert(measuringRings, measuring)
        table.insert(measuringRings, base)

        broadcastToAll("Measuring "..tostring(newRadius).."″")
    end

    target.setVectorLines(measuringRings)

    target.setTable("ym-measuring-circles", measuringRings)
end


function getCircleVectorPoints(radius, baseX, baseZ, obj)
    local result = {}
    local scaleFactor = 1/obj.getScale().x
    local rotationDegrees =  obj.getRotation().y
    local steps = 64
    local degrees,sin,cos,toRads = 360/steps, math.sin, math.cos, math.rad

    for i = 0,steps do
        table.insert(result,{
            x = cos(toRads(degrees*i))*((radius+baseX)*scaleFactor),
            z = MEASURING_RING_Y_OFFSET,
            y = sin(toRads(degrees*i))*((radius+baseZ)*scaleFactor)
        })
    end

    return result
end


function getRectangleVectorPoints(radius, sizeX, sizeZ, obj)
    local result = {}
    local scaleFactor = 1/obj.getScale().x

    sizeX = sizeX*scaleFactor
    sizeZ = sizeZ*scaleFactor
    radius = radius*scaleFactor

    local steps = 65
    local degrees,sin,cos,toRads = 360/(steps-1), math.sin, math.cos, math.rad
    local xOffset,zOffset = sizeX,sizeZ
    -- compensate for ignoring vertical line
    table.insert(result,{
        x = (cos(toRads(degrees*0))*radius)+sizeX-0.001,
        y = (sin(toRads(degrees*0))*radius)+sizeZ,
        z = MEASURING_RING_Y_OFFSET
    })

    for i = 1,steps-1 do
        if i == 16 then
            table.insert(result,{ x= sizeX, y=(radius+sizeZ), z=MEASURING_RING_Y_OFFSET })
            table.insert(result,{ x=-sizeX, y=(radius+sizeZ), z=MEASURING_RING_Y_OFFSET })
            xOffset = -sizeX
        elseif i == 33 then
            table.insert(result,{ x=-radius-sizeX,       y= sizeZ, z=MEASURING_RING_Y_OFFSET })
            table.insert(result,{ x=-radius-sizeX-0.001, y=-sizeZ, z=MEASURING_RING_Y_OFFSET })
            table.insert(result,{ x=-radius-sizeX,       y=-sizeZ, z=MEASURING_RING_Y_OFFSET })
            zOffset = -sizeZ
        elseif i == 49 then
            table.insert(result,{ x=-sizeX, y=-radius-sizeZ, z=MEASURING_RING_Y_OFFSET })
            table.insert(result,{ x= sizeX, y=-radius-sizeZ, z=MEASURING_RING_Y_OFFSET })
            xOffset = sizeX
        elseif i == 65 then
            table.insert(result,{ x=radius+sizeX,       y=-sizeZ, z=MEASURING_RING_Y_OFFSET })
            table.insert(result,{ x=radius+sizeX-0.001, y= sizeZ, z=MEASURING_RING_Y_OFFSET })
        else
            table.insert(result,{
                x = (cos(toRads(degrees*i))*radius)+xOffset,
                y = (sin(toRads(degrees*i))*radius)+zOffset,
                z = MEASURING_RING_Y_OFFSET
            })
        end
    end
    -- compensate for ignoring vertical line
    table.insert(result,{
        x = (cos(toRads(degrees*0))*radius)+sizeX-0.001,
        y = (sin(toRads(degrees*0))*radius)+sizeZ,
        z = MEASURING_RING_Y_OFFSET
    })

    return result
end




-- this needs to be defined after all scripting functions
scriptingFunctions = {
    --[[1]]  function (playerColor) showCard('dataCard', playerColor) end,
    --[[2]]  function (playerColor, target) changeModelWoundCount(-1, target) end,
    --[[3]]  function (playerColor, target) changeModelWoundCount(1, target) end,
    --[[4]]  function (playerColor, target) changeMeasurementCircle(1, target) end,
    --[[5]]  function (playerColor, target) changeMeasurementCircle(-1, target) end,
    --[[6]]  function (playerColor, target) incrementColor(target) end,
    --[[7]]  toggleCoherencyChecking,
    --[[8]]  function (playerColor, target) assignBase(-1, target) end,
    --[[9]]  function (playerColor, target) assignBase(1, target) end,
    --[[0]]  toggleRectangularMeasuring,
}
