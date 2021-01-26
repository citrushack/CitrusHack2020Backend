

/**
 * User.js controller
 *
 * @description: A set of functions called "actions" for managing `User`.
 */

const pick = require('lodash/pick');
const some = require('lodash/some');
const isEmpty = require('lodash/isEmpty');

const every = require('lodash/every');
const partial = require('lodash/partial');
const has = require('lodash/has');

const { sanitizeEntity } = require('strapi-utils');

const sanitizeUser = user =>
  sanitizeEntity(user, {
    model: strapi.query('user', 'users-permissions').model,
  });

const sanitizeGroup = group =>
  sanitizeEntity(group, {
    model: strapi.query('group').model,
  });

const formatError = error => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

// Place all possible registration fields here
const superSetRegisterValues = ['addr1', 'addr2', 'major', 'linkedin', 'github', 'extra', 'country', 'city', 'state', 'zip', 'firstname', 'lastname', 'gender', 'school', 'year'];
// Place required registration fields here
const requiredRegisterValues = ['addr1', 'major', 'country', 'city', 'state', 'zip', 'firstname', 'lastname', 'gender', 'school', 'year'];

const validateRequest = req => every(requiredRegisterValues, partial(has, req));


module.exports = {

  /**
   * Update a/an user record.
   * @return {Object}
   */
  async updateme(ctx) {
    const advancedConfigs = await strapi
        .store({
            environment: '',
            type: 'plugin',
            name: 'users-permissions',
            key: 'advanced',
        })
        .get();

    //Fetch the user's strapi state acoording to jwt
    const id = ctx.state.user.id;
    const user = await strapi.plugins['users-permissions'].services.user.fetch({
        id,
    });


    //If the application is complete, only group changes are allowed
    if (!has(ctx.request.body, 'group') && user.appComplete) return ctx.badRequest('OnlyGroupChangesAllowed');

    //If the application is not complete, register.
    if (!user.appComplete) {
        //Check if required values are present in request
        strapi.log.debug("ctx.request.body ", ctx.request.body);

        const isValid = validateRequest(ctx.request.body);
        if (!isValid) return ctx.badRequest('NotFinished');

        //Pick superset of possible values from request to prevent 
        //unwanted data manipulation
        const upData = pick(ctx.request.body, superSetRegisterValues);

        strapi.log.debug("upData ", upData);

        if (user) {
            try {
                const response = await strapi.services.mailchimp.request({
                    method: 'post',
                    path: '/lists/affb618484/members',
                    body: {
                        email_address: user.email,
                        status: "subscribed"
                    }
                })
                const {
                    _links,
                    ...res
                } = response;
            } catch (err) {
                strapi.log.debug('status', err.status);
                strapi.log.debug('body', err.detail);
            }
        //Update application complete boolean
        const updatedPerson = await strapi.plugins['users-permissions'].services.user.edit({
            id
        }, {
            ...upData,
            appComplete: true
        });
        if (!updatedPerson) return ctx.badRequest('CouldNotUpdatePerson');
        let cleaned = sanitizeUser(updatedPerson);
        return ctx.send(cleaned);
      } else {
        return ctx.badRequest('CouldNotFindUser');
      }
    }
    //strapi.log.debug("updateData", user.group['id']);
    
    //If reached here, application is complete, group is in request data
    if (ctx.request.body.group == 'none') {
        if (!user.group) return ctx.badRequest('NotCurrentlyInGroup');
        await strapi.plugins['users-permissions'].services.user.edit({
            id
        }, {
            group: null
        });
        return ctx.send({
            response: 'GroupLeft'
        });
    }

    const foundGroup = await strapi.query('group').findOne({
        uid: ctx.request.body.group
    });
    
    if (!foundGroup) return ctx.badRequest('CouldNotFindGroup');


    if (has(foundGroup, 'users') && foundGroup.users.length > 3) return ctx.badRequest('GroupMaxSize');

    const updateData = {
        'group': foundGroup.id
    };

    const updatedPerson = await strapi.plugins['users-permissions'].services.user.edit({
        id
    }, updateData);
    if (!updatedPerson) return ctx.badRequest('CouldNotUpdatePerson');

    const group = await strapi.query('group').findOne({
        uid: ctx.request.body.group
    });
    if (!group) return ctx.badRequest('CouldNotReturnGroup');

    let cleaned = sanitizeGroup(group);

    if (has(cleaned, 'users') && cleaned.users.length) {
        cleaned.users = cleaned.users.map(user => pick(user, ['firstname', 'lastname', 'id']));
    }

    return ctx.send(cleaned);

    //updateData = {...ctx.request.body};
    // strapi.log.debug("updateData", updateData);
    // strapi.log.debug("foundGroup", foundGroup);
},
  async getMyGroup(ctx) {
    const advancedConfigs = await strapi
      .store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
        key: 'advanced',
      })
      .get();

    const id = ctx.state.user.id;
    const user = await strapi.plugins['users-permissions'].services.user.fetch({
      id,
    });
    if(!has(user, 'group.id')){
      return ctx.badRequest('UserNotInGroup');
    }
    const foundGroup = await strapi.query('group').findOne({ id: user.group['id'] });
    if(!foundGroup) return ctx.badRequest('CouldNotFindGroup');

    let cleaned = sanitizeGroup(foundGroup);

    if(has(cleaned, 'users') && cleaned.users.length ){
      cleaned.users = cleaned.users.map(user => pick(user, ['firstname', 'lastname', 'id']));
    }

    return ctx.send(cleaned);

    //updateData = {...ctx.request.body};
      // strapi.log.debug("updateData", updateData);
      // strapi.log.debug("foundGroup", foundGroup);
  },
  async getMyStatus(ctx) {
    const advancedConfigs = await strapi
      .store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
        key: 'advanced',
      })
      .get();

    const status = ctx.state.user["appstatus"];

    return ctx.send({status: status});

  }


};