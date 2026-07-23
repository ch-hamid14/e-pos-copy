import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Select, message } from 'antd'
import { categoryAPI, productAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { SelectQuickFooter } from './SelectQuickFooter'

export type ProductQuickRecord = {
  id: string
  name?: string
  categoryId?: string
  description?: string
  category?: { id?: string; name?: string }
}

type Props = {
  open: boolean
  onCancel: () => void
  onSaved: (product: ProductQuickRecord) => void
}

function asProduct(row: any): ProductQuickRecord {
  return {
    id: String(row.id),
    name: row.name,
    categoryId: row.categoryId || row.category_id,
    description: row.description,
    category: row.category
  }
}

export function ProductQuickModal({ open, onCancel, onSaved }: Props) {
  const { companyId, audit } = useSession()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<any[]>([])
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [categoryForm] = Form.useForm()
  const [categoryLoading, setCategoryLoading] = useState(false)

  const loadCategories = () => {
    if (!companyId) return Promise.resolve()
    return categoryAPI.list(companyId).then(setCategories)
  }

  useEffect(() => {
    if (!open) return
    form.resetFields()
    loadCategories()
  }, [open, form, companyId])

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
      const created = await productAPI.create(companyId, audit(), {
        name: values.name,
        categoryId: values.categoryId,
        description: values.description || ''
      })
      message.success('Product created')
      onSaved(asProduct(created))
      form.resetFields()
    } catch (err: any) {
      message.error(err.message || 'Failed to create product')
    } finally {
      setLoading(false)
    }
  }

  const handleCategorySubmit = async (values: { name: string }) => {
    if (!companyId) return
    setCategoryLoading(true)
    try {
      const created: any = await categoryAPI.create(companyId, audit(), { name: values.name })
      message.success('Category created')
      await loadCategories()
      form.setFieldValue('categoryId', String(created.id))
      setCategoryModalOpen(false)
      categoryForm.resetFields()
    } catch (err: any) {
      message.error(err.message || 'Failed to create category')
    } finally {
      setCategoryLoading(false)
    }
  }

  return (
    <>
      <Modal
        title="Add Product"
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
              dropdownRender={(menu) => (
                <SelectQuickFooter
                  menu={menu}
                  addLabel="Add category"
                  onAdd={() => setCategoryModalOpen(true)}
                />
              )}
            />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Create
          </Button>
        </Form>
      </Modal>

      <Modal
        title="Add Category"
        open={categoryModalOpen}
        onCancel={() => setCategoryModalOpen(false)}
        footer={null}
        destroyOnClose
        width={400}
      >
        <Form form={categoryForm} layout="vertical" onFinish={handleCategorySubmit}>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Category name" autoFocus />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={categoryLoading}>
            Create
          </Button>
        </Form>
      </Modal>
    </>
  )
}
