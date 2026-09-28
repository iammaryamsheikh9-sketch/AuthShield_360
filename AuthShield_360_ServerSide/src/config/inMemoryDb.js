import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.resolve("./data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

const generateObjectId = () => {
  return crypto.randomBytes(12).toString("hex");
};

class InMemoryDb {
  constructor() {
    this.collections = {
      users: [],
      roles: [],
      passwordcredentials: [],
      mfamethods: [],
      sessions: [],
      loginattempts: [],
      auditlogs: [],
      students: [],
      academicrecords: [],
      securitytestresults: []
    };
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        const loaded = JSON.parse(raw);
        this.collections = { ...this.collections, ...loaded };
      }
    } catch (e) {
      console.warn("Could not load database file, starting fresh in-memory:", e.message);
    }
    this.isInitialized = true;
  }

  saveToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.collections, null, 2), "utf-8");
    } catch (e) {
      console.warn("Error saving db to disk:", e.message);
    }
  }

  getCollection(name) {
    const key = name.toLowerCase().replace(/[^a-z]/g, "") + (name.endsWith("s") ? "" : "s");
    if (!this.collections[key]) {
      this.collections[key] = [];
    }
    return this.collections[key];
  }
}

const dbInstance = new InMemoryDb();
dbInstance.init();

class Query {
  constructor(model, filter = {}, isFindOne = false) {
    this.model = model;
    this.filter = filter;
    this.isFindOne = isFindOne;
    this.populateFields = [];
    this.selectedFields = [];
    this.deselectedFields = [];
    this._sort = null;
    this._limit = null;
    this._skip = 0;
  }

  populate(field) {
    if (typeof field === "string") {
      this.populateFields.push(field);
    } else if (typeof field === "object" && field.path) {
      this.populateFields.push(field.path);
    }
    return this;
  }

  select(fields) {
    if (!fields) return this;
    const parts = fields.trim().split(/\s+/);
    for (const part of parts) {
      if (part.startsWith("+")) {
        // Explicitly include field normally omitted
        this.selectedFields.push(part.substring(1));
      } else if (part.startsWith("-")) {
        this.deselectedFields.push(part.substring(1));
      } else {
        this.selectedFields.push(part);
      }
    }
    return this;
  }

  sort(sortObj) {
    this._sort = sortObj;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  skip(n) {
    this._skip = n;
    return this;
  }

  matches(doc, filter) {
    if (!filter || Object.keys(filter).length === 0) return true;

    if (filter.$or && Array.isArray(filter.$or)) {
      return filter.$or.some((subFilter) => this.matches(doc, subFilter));
    }

    for (const [key, val] of Object.entries(filter)) {
      if (key === "$or") continue;

      const docVal = doc[key];

      if (val instanceof Date) {
        if (!docVal) return false;
        const d1 = new Date(docVal).getTime();
        const d2 = val.getTime();
        if (d1 !== d2) return false;
      } else if (val && typeof val === "object" && !Array.isArray(val)) {
        if (val.$gt !== undefined && !(new Date(docVal) > new Date(val.$gt))) return false;
        if (val.$gte !== undefined && !(new Date(docVal) >= new Date(val.$gte))) return false;
        if (val.$lt !== undefined && !(new Date(docVal) < new Date(val.$lt))) return false;
        if (val.$lte !== undefined && !(new Date(docVal) <= new Date(val.$lte))) return false;
        if (val.$ne !== undefined && docVal === val.$ne) return false;
        if (val.$in !== undefined && (!Array.isArray(val.$in) || !val.$in.includes(docVal))) return false;
      } else {
        const strDocVal = String(docVal !== undefined && docVal !== null ? docVal : "");
        const strVal = String(val !== undefined && val !== null ? val : "");
        if (strDocVal !== strVal) {
          return false;
        }
      }
    }
    return true;
  }

  async exec() {
    const rawList = dbInstance.getCollection(this.model.modelName);
    let results = rawList.filter((item) => this.matches(item, this.filter));

    if (this._sort) {
      const [sortKey, sortDir] = Object.entries(this._sort)[0] || [];
      if (sortKey) {
        results.sort((a, b) => {
          if (a[sortKey] < b[sortKey]) return sortDir === -1 ? 1 : -1;
          if (a[sortKey] > b[sortKey]) return sortDir === -1 ? -1 : 1;
          return 0;
        });
      }
    }

    if (this._skip) {
      results = results.slice(this._skip);
    }
    if (this._limit) {
      results = results.slice(0, this._limit);
    }

    if (this.isFindOne) {
      const item = results[0] ? this.model._wrapDoc(results[0]) : null;
      if (item && this.populateFields.length > 0) {
        await this._populateDoc(item);
      }
      return item;
    }

    const wrappedList = results.map((r) => this.model._wrapDoc(r));
    if (this.populateFields.length > 0) {
      for (const item of wrappedList) {
        await this._populateDoc(item);
      }
    }
    return wrappedList;
  }

  async _populateDoc(doc) {
    for (const popPath of this.populateFields) {
      const reference = doc[popPath];
      const refId = reference && typeof reference === "object" && reference._id
        ? reference._id
        : reference;
      if (!refId) continue;

      if (popPath === "role") {
        const Role = this.model.registry.Role;
        if (Role) {
          doc.role = await Role.findById(refId);
        }
      } else if (popPath === "user") {
        const User = this.model.registry.User;
        if (User) {
          doc.user = await User.findById(refId);
        }
      } else if (popPath === "student") {
        const Student = this.model.registry.Student;
        if (Student) {
          doc.student = await Student.findById(refId);
        }
      } else if (popPath === "teacher") {
        const User = this.model.registry.User;
        if (User) {
          doc.teacher = await User.findById(refId);
        }
      }
    }
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }
}

class InMemoryModel {
  constructor(modelName, registry = {}) {
    this.modelName = modelName;
    this.registry = registry;
  }

  _wrapDoc(rawObj) {
    if (!rawObj) return null;
    const model = this;
    const doc = { ...rawObj };

    // Define helper methods on document instance
    doc.save = async function () {
      doc.updatedAt = new Date();
      const coll = dbInstance.getCollection(model.modelName);
      const idx = coll.findIndex((item) => String(item._id) === String(doc._id));
      if (idx !== -1) {
        // update
        coll[idx] = { ...doc };
        delete coll[idx].save;
        delete coll[idx].toObject;
        delete coll[idx].toJSON;
      } else {
        const cleanDoc = { ...doc };
        delete cleanDoc.save;
        delete cleanDoc.toObject;
        delete cleanDoc.toJSON;
        coll.push(cleanDoc);
      }
      dbInstance.saveToDisk();
      return doc;
    };

    doc.toObject = function () {
      const obj = { ...doc };
      delete obj.save;
      delete obj.toObject;
      delete obj.toJSON;
      return obj;
    };

    doc.toJSON = function () {
      return doc.toObject();
    };

    return doc;
  }

  findOne(filter = {}) {
    return new Query(this, filter, true);
  }

  find(filter = {}) {
    return new Query(this, filter, false);
  }

  findById(id) {
    return new Query(this, { _id: String(id) }, true);
  }

  async findByIdAndUpdate(id, updateData, options = {}) {
    const coll = dbInstance.getCollection(this.modelName);
    const idx = coll.findIndex((item) => String(item._id) === String(id));
    if (idx === -1) return null;

    const current = coll[idx];
    const updated = {
      ...current,
      ...updateData,
      updatedAt: new Date()
    };
    coll[idx] = updated;
    dbInstance.saveToDisk();
    return this._wrapDoc(updated);
  }

  async findOneAndUpdate(filter, updateData, options = {}) {
    const doc = await this.findOne(filter);
    if (!doc) {
      if (options.upsert) {
        return this.create({ ...filter, ...updateData });
      }
      return null;
    }
    return this.findByIdAndUpdate(doc._id, updateData, options);
  }

  async create(data) {
    const coll = dbInstance.getCollection(this.modelName);
    const now = new Date();
    const docData = {
      _id: data._id || generateObjectId(),
      ...data,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now
    };
    coll.push(docData);
    dbInstance.saveToDisk();
    return this._wrapDoc(docData);
  }

  async countDocuments(filter = {}) {
    const list = await this.find(filter);
    return list.length;
  }

  async deleteMany(filter = {}) {
    const coll = dbInstance.getCollection(this.modelName);
    const query = new Query(this, filter, false);
    const remaining = coll.filter((item) => !query.matches(item, filter));
    const deletedCount = coll.length - remaining.length;
    coll.splice(0, coll.length, ...remaining);
    dbInstance.saveToDisk();
    return { deletedCount };
  }
}

export { InMemoryDb, InMemoryModel, dbInstance, generateObjectId };
