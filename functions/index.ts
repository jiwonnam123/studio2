import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

export const assignEmailByCampaign = functions.firestore
  .document('inquiries/{docId}')
  .onCreate(async (snap, context) => {
    const inquiry = snap.data();
    const firstRow = Array.isArray(inquiry.data) && inquiry.data[0];
    const campaignKey = firstRow?.campaignKey;
    if (!campaignKey) {
      console.log('No campaignKey found in inquiry');
      return null;
    }

    try {
      const mappingSnap = await db
        .collection('campaignEmailMappings')
        .doc(campaignKey)
        .get();

      const email = mappingSnap.exists ? mappingSnap.data()?.email : null;
      if (!email) {
        console.log(`No email mapping for campaignKey: ${campaignKey}`);
        return null;
      }

      await snap.ref.update({ campaignEmail: email });
    } catch (err) {
      console.error('Error assigning campaign email', err);
    }
    return null;
  });
