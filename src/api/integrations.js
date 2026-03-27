// Integrations removed - base44 integrations no longer available
// If you need these features, implement them using alternative services

export const Core = {
  InvokeLLM: () => Promise.reject(new Error('Not implemented - base44 removed')),
  SendEmail: () => Promise.reject(new Error('Not implemented - base44 removed')),
  UploadFile: () => Promise.reject(new Error('Not implemented - base44 removed')),
  GenerateImage: () => Promise.reject(new Error('Not implemented - base44 removed')),
  ExtractDataFromUploadedFile: () => Promise.reject(new Error('Not implemented - base44 removed')),
  CreateFileSignedUrl: () => Promise.reject(new Error('Not implemented - base44 removed')),
  UploadPrivateFile: () => Promise.reject(new Error('Not implemented - base44 removed')),
};

export const InvokeLLM = Core.InvokeLLM;
export const SendEmail = Core.SendEmail;
export const UploadFile = Core.UploadFile;
export const GenerateImage = Core.GenerateImage;
export const ExtractDataFromUploadedFile = Core.ExtractDataFromUploadedFile;
export const CreateFileSignedUrl = Core.CreateFileSignedUrl;
export const UploadPrivateFile = Core.UploadPrivateFile;






