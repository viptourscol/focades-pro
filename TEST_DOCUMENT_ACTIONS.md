# 🧪 Test Plan: Document Action Stack Overflow Fix

## 🔍 What We Fixed
**Bug**: `RangeError: Maximum call stack size exceeded` when replacing/deleting documents
**Root Cause**: `String.fromCharCode(...new Uint8Array())` causes stack overflow with large arrays
**Solution**: Use `FileReader.readAsDataURL()` instead - handles large files safely

---

## 📋 Test Cases

### ✅ Test 1: Replace Small Document (Inscripción)
**Steps**:
1. Login as admin to `/admin/beneficiario/detalle/[id]`
2. Navigate to "Expediente" tab
3. Find any document (ej: "documento_identidad")
4. Click the three-dot menu → "Reemplazar"
5. Select a PDF file (< 1MB)
6. Enter a reason (ej: "Actualización requerida")
7. Click "Reemplazar"

**Expected Result**:
- ✅ No "Maximum call stack size exceeded" error
- ✅ Success alert appears
- ✅ Modal closes
- ✅ Document list refreshes automatically
- ✅ New document appears in list

**Console Check**:
- Should see: `📄 Documento a procesar: {...}`
- Should NOT see: `❌ Error en executeDocumentAction: RangeError`

---

### ✅ Test 2: Replace Large Document (Inscripción)
**Steps**:
1. Same as Test 1 but select a PDF file (5-10MB)
2. Click "Reemplazar"

**Expected Result**:
- ✅ No stack overflow (this was the bug!)
- ✅ Success alert appears
- ✅ Document updates correctly

**Console Check**:
- Monitor console while file is being uploaded
- Should see: `📄 Documento a procesar: {...}`
- Should NOT see stack overflow error

---

### ✅ Test 3: Delete Document (Inscripción)
**Steps**:
1. Go to "Expediente" tab
2. Click three-dot menu on any document → "Eliminar"
3. Enter reason
4. Confirm deletion

**Expected Result**:
- ✅ Confirmation dialog appears (above modal)
- ✅ After confirmation, success alert appears
- ✅ Document is deleted
- ✅ List refreshes

---

### ✅ Test 4: Replace Document (Onboarding)
**Steps**:
1. Navigate to "Onboarding" tab
2. Click three-dot menu on any document → "Reemplazar"
3. Select PDF (any size)
4. Enter reason
5. Click "Reemplazar"

**Expected Result**:
- ✅ No stack overflow
- ✅ Success alert
- ✅ Document updates in onboarding list

---

### ✅ Test 5: Auto-Refresh After Actions
**Steps**:
1. Go to "Expediente" tab with multiple documents
2. Replace a document
3. Watch the document list

**Expected Result**:
- ✅ After success alert closes, expediente tab automatically refreshes
- ✅ List shows updated document

**Steps for Onboarding**:
1. Go to "Onboarding" tab
2. Delete a document
3. Watch the document list

**Expected Result**:
- ✅ After success alert closes, onboarding tab automatically refreshes
- ✅ List shows document is gone

---

## 🔧 Technical Details

### What Changed
**File**: `src/pages/AdminBeneficiarioDetalle.jsx` line ~1258

**Before** (❌ Causes stack overflow):
```javascript
const fileBuffer = await nuevoArchivo.arrayBuffer()
const base64String = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)))
```

**After** (✅ Safe for all file sizes):
```javascript
const base64String = await new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(nuevoArchivo);
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    resolve(base64);
  };
  reader.onerror = reject;
});
```

### Why FileReader is Better
- ✅ Handles buffer internally
- ✅ No spread operator `...` expansion (no stack overflow)
- ✅ Asynchronous and safe
- ✅ Works with files of any size
- ✅ Standard browser API

---

## 📊 Regression Testing

### Check These Don't Break
- [ ] Document upload in BeneficiarioActualizacion (not affected - uses different method)
- [ ] Admin can still view documents
- [ ] Bitácora (audit log) records document actions
- [ ] Email notifications sent after actions
- [ ] Role-based access still works

---

## 🎯 Expected Outcome
After this fix:
- ✅ Document replacement works without errors
- ✅ Document deletion works without errors
- ✅ All file sizes are supported (previously only < 100KB worked)
- ✅ Modal closes cleanly
- ✅ Success alerts appear properly
- ✅ Tabs auto-refresh after actions

---

## 📝 Commit Info
- **Commit**: f38e928
- **Message**: "fix: resolve stack overflow in base64 conversion using FileReader"
- **Files Modified**: 1 file changed, 11 insertions(+), 3 deletions(-)

---

## ⚠️ If Tests Fail

### Error: Still getting stack overflow?
- ⚡ Hard reload: `Cmd+Shift+R` (clear cache)
- ⚡ Check browser console for exact error location
- ⚡ Try with different file size

### Error: Modal doesn't close?
- Check if `closeDocumentActionModal()` is being called
- Verify state management in finally block

### Error: Tab doesn't auto-refresh?
- Check if `loadedTabs[tabName]` is true
- Verify async functions complete

---

**🚀 Ready to test! Report any issues in the console logs.**
