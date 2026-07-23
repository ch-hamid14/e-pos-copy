import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Select, message } from 'antd'
import { categoryAPI, productAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { SelectQuickFooter } from '../quick/SelectQuickFooter'
import { NameEntityFormModal } from './NameEntityFormModal'

export type ProductRecord = {
  id: string
  name?: string
  categoryId?: string
  description?: string
  category?: { id?: string; name?: string }
}

type Props = {
  open: boolean
  editing?: ProductRecord | null
  onCancel: () => void
  onSaved: (product: ProductRecord) => void
  /** Show “Add category” in the category dropdown (purchase quick-add). */
  allowQuickCategoryAdd?: boolean
}

function asProduct(row: any): ProductRecord {
  return {
    id: String(row.id),
    name: row.name,
    categoryId: row.categoryId || row.category_id,
    description: row.description,
    category: row.category
  }
}

/** Shared add/edit product modal (Products page + purchase quick actions). */
export function ProductFormModal({
  open,
  editing,
  onCancel,
  onSaved,
  allowQuickCategoryAdd = false
}: Props) {
  const { companyId, audit } = useSession()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<any[]>([])
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const isEdit = Boolean(editing?.id)

  const loadCategories = () => {
    if (!companyId) return Promise.resolve()
    return categoryAPI.list(companyId).then(setCategories)
  }

  useEffect(() => {
    if (!open) return
    loadCategories()
    if (editing?.id) {
      form.setFieldsValue({
        name: editing.name,
        categoryId: editing.categoryId || editing.category?.id,
        description: editing.description
      })
    } else {
      form.resetFields()
    }
  }, [open, editing, form, companyId])

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories]
  )

  const handleSubmit = async (values: {
    name: string
    categoryId: string
    description?: string
  }) => {
    if (!companyId) return
    setLoading(true)
    try {
      const payload = {
        name: values.name,
        categoryId: values.categoryId,
        description: values.description || ''
      }
      if (isEdit && editing) {
        const updated = await productAPI.update(editing.id, companyId, audit(), payload)
        message.success('Product updated')
        onSaved(asProduct(updated || { ...editing, ...payload }))
      } else {
        const created = await productAPI.create(companyId, audit(), payload)
        message.success('Product created')
        onSaved(asProduct(created))
      }
      form.resetFields()
    } catch (err: any) {
      message.error(err.message || 'Operation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Modal
        title={isEdit ? 'Edit Product' : 'Add Product'}
        open={open}
        onCancel={onCancel}
        footer={null}
        destroyOnClose
        width={480}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Product name" autoFocus />
          </Form.Item>
          <Form.Item
            name="categoryId"
            label="Category"
            rules={[{ required: true, message: 'Select a category' }]}
          >
            <Select
              placeholder="Select category"
              options={categoryOptions}
              showSearch
              optionFilterProp="label"
              notFoundContent="No categories yet"
              dropdownRender={
                allowQuickCategoryAdd
                  ? (menu) => (
                      <SelectQuickFooter
                        menu={menu}
                        addLabel="Add category"
                        onAdd={() => setCategoryModalOpen(true)}
                      />
                    )
                  : undefined
              }
            />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </Form>
      </Modal>

      {allowQuickCategoryAdd && companyId ? (
        <NameEntityFormModal
          entityLabel="Category"
          open={categoryModalOpen}
          onCancel={() => setCategoryModalOpen(false)}
          onCreate={(name) => categoryAPI.create(companyId, audit(), { name })}
          onSaved={async (row) => {
            setCategoryModalOpen(false)
            await loadCategories()
            form.setFieldValue('categoryId', row.id)
          }}
        />
      ) : null}
    </>
  )
}
