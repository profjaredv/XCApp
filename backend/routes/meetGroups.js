const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate, authorizeTeamAccess } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * @route   GET /api/meet-groups/:teamId
 * @desc    Get all meet groups for a team
 * @access  Private (Team Member)
 */
router.get(
  '/:teamId',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId } = req.params;

      logger.info(`Fetching meet groups for team ${teamId}`);

      // Get all meet groups with their races
      const { data: meetGroups, error: groupsError } = await supabase
        .from('meet_groups')
        .select(`
          id,
          group_name,
          description,
          created_at,
          updated_at,
          meet_group_races (
            id,
            race_id,
            races (
              id,
              name,
              season,
              date
            )
          )
        `)
        .eq('team_id', teamId)
        .order('group_name');

      if (groupsError) {
        logger.error('Error fetching meet groups:', groupsError);
        logger.error('Error details:', JSON.stringify(groupsError, null, 2));
        throw groupsError;
      }

      logger.info(`Found ${meetGroups?.length || 0} meet groups`);

      // Transform the data for easier frontend consumption
      const transformedGroups = (meetGroups || []).map(group => ({
        id: group.id,
        groupName: group.group_name,
        description: group.description,
        createdAt: group.created_at,
        updatedAt: group.updated_at,
        races: (group.meet_group_races || []).map(mgr => mgr.races).filter(Boolean),
        seasons: [...new Set((group.meet_group_races || []).map(mgr => mgr.races?.season).filter(Boolean))].sort()
      }));

      res.json({
        success: true,
        data: transformedGroups
      });
    } catch (error) {
      logger.error(`Error fetching meet groups: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch meet groups',
        error: error.message
      });
    }
  }
);

/**
 * @route   POST /api/meet-groups/:teamId
 * @desc    Create a new meet group
 * @access  Private (Coach only)
 */
router.post(
  '/:teamId',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId } = req.params;
      const { groupName, description, raceIds } = req.body;

      if (!groupName) {
        return res.status(400).json({
          success: false,
          message: 'Group name is required'
        });
      }

      logger.info(`Creating meet group "${groupName}" for team ${teamId}`);

      // Create the meet group
      const { data: newGroup, error: groupError } = await supabase
        .from('meet_groups')
        .insert({
          team_id: teamId,
          group_name: groupName,
          description: description || null
        })
        .select()
        .single();

      if (groupError) {
        logger.error('Error creating meet group:', groupError);
        throw groupError;
      }

      // Add races to the group if provided
      if (raceIds && raceIds.length > 0) {
        const raceInserts = raceIds.map(raceId => ({
          meet_group_id: newGroup.id,
          race_id: raceId
        }));

        const { error: racesError } = await supabase
          .from('meet_group_races')
          .insert(raceInserts);

        if (racesError) {
          logger.error('Error adding races to meet group:', racesError);
          // Don't fail the whole operation, just log it
        }
      }

      res.status(201).json({
        success: true,
        data: {
          id: newGroup.id,
          groupName: newGroup.group_name,
          description: newGroup.description
        }
      });
    } catch (error) {
      logger.error(`Error creating meet group: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to create meet group',
        error: error.message
      });
    }
  }
);

/**
 * @route   PUT /api/meet-groups/:teamId/:groupId
 * @desc    Update a meet group
 * @access  Private (Coach only)
 */
router.put(
  '/:teamId/:groupId',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId, groupId } = req.params;
      const { groupName, description } = req.body;

      logger.info(`Updating meet group ${groupId} for team ${teamId}`);

      const updateData = {};
      if (groupName !== undefined) updateData.group_name = groupName;
      if (description !== undefined) updateData.description = description;

      const { data: updatedGroup, error: updateError } = await supabase
        .from('meet_groups')
        .update(updateData)
        .eq('id', groupId)
        .eq('team_id', teamId)
        .select()
        .single();

      if (updateError) {
        logger.error('Error updating meet group:', updateError);
        throw updateError;
      }

      res.json({
        success: true,
        data: {
          id: updatedGroup.id,
          groupName: updatedGroup.group_name,
          description: updatedGroup.description
        }
      });
    } catch (error) {
      logger.error(`Error updating meet group: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to update meet group',
        error: error.message
      });
    }
  }
);

/**
 * @route   DELETE /api/meet-groups/:teamId/:groupId
 * @desc    Delete a meet group
 * @access  Private (Coach only)
 */
router.delete(
  '/:teamId/:groupId',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId, groupId } = req.params;

      logger.info(`Deleting meet group ${groupId} for team ${teamId}`);

      const { error: deleteError } = await supabase
        .from('meet_groups')
        .delete()
        .eq('id', groupId)
        .eq('team_id', teamId);

      if (deleteError) {
        logger.error('Error deleting meet group:', deleteError);
        throw deleteError;
      }

      res.json({
        success: true,
        message: 'Meet group deleted successfully'
      });
    } catch (error) {
      logger.error(`Error deleting meet group: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to delete meet group',
        error: error.message
      });
    }
  }
);

/**
 * @route   POST /api/meet-groups/:teamId/:groupId/races
 * @desc    Add a race to a meet group
 * @access  Private (Coach only)
 */
router.post(
  '/:teamId/:groupId/races',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId, groupId } = req.params;
      const { raceId } = req.body;

      if (!raceId) {
        return res.status(400).json({
          success: false,
          message: 'Race ID is required'
        });
      }

      logger.info(`Adding race ${raceId} to meet group ${groupId}`);

      const { error: insertError } = await supabase
        .from('meet_group_races')
        .insert({
          meet_group_id: groupId,
          race_id: raceId
        });

      if (insertError) {
        logger.error('Error adding race to meet group:', insertError);
        throw insertError;
      }

      res.status(201).json({
        success: true,
        message: 'Race added to meet group successfully'
      });
    } catch (error) {
      logger.error(`Error adding race to meet group: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to add race to meet group',
        error: error.message
      });
    }
  }
);

/**
 * @route   DELETE /api/meet-groups/:teamId/:groupId/races/:raceId
 * @desc    Remove a race from a meet group
 * @access  Private (Coach only)
 */
router.delete(
  '/:teamId/:groupId/races/:raceId',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId, groupId, raceId } = req.params;

      logger.info(`Removing race ${raceId} from meet group ${groupId}`);

      const { error: deleteError } = await supabase
        .from('meet_group_races')
        .delete()
        .eq('meet_group_id', groupId)
        .eq('race_id', raceId);

      if (deleteError) {
        logger.error('Error removing race from meet group:', deleteError);
        throw deleteError;
      }

      res.json({
        success: true,
        message: 'Race removed from meet group successfully'
      });
    } catch (error) {
      logger.error(`Error removing race from meet group: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to remove race from meet group',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/meet-groups/:teamId/ungrouped-races
 * @desc    Get all races that aren't in any meet group
 * @access  Private (Team Member)
 */
router.get(
  '/:teamId/ungrouped-races',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId } = req.params;

      logger.info(`Fetching ungrouped races for team ${teamId}`);

      // Get all races for the team
      const { data: allRaces, error: racesError } = await supabase
        .from('races')
        .select('id, name, season, date')
        .eq('team_id', teamId)
        .order('season', { ascending: false })
        .order('date', { ascending: false });

      if (racesError) {
        logger.error('Error fetching races:', racesError);
        throw racesError;
      }

      // Get all races that are in groups for this team
      const { data: meetGroupsForTeam, error: groupsError } = await supabase
        .from('meet_groups')
        .select('id')
        .eq('team_id', teamId);

      if (groupsError) {
        logger.error('Error fetching meet groups:', groupsError);
        throw groupsError;
      }

      const groupIds = (meetGroupsForTeam || []).map(g => g.id);
      
      let groupedRaceIds = new Set();
      if (groupIds.length > 0) {
        const { data: groupedRaces, error: groupedError } = await supabase
          .from('meet_group_races')
          .select('race_id')
          .in('meet_group_id', groupIds);

        if (groupedError) {
          logger.error('Error fetching grouped races:', groupedError);
          throw groupedError;
        }

        groupedRaceIds = new Set((groupedRaces || []).map(gr => gr.race_id));
      }

      const ungroupedRaces = (allRaces || []).filter(race => !groupedRaceIds.has(race.id));

      res.json({
        success: true,
        data: ungroupedRaces
      });
    } catch (error) {
      logger.error(`Error fetching ungrouped races: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch ungrouped races',
        error: error.message
      });
    }
  }
);

module.exports = router;
